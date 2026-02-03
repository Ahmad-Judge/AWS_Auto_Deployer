import { Worker } from "bullmq";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import connection from "../redis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

const s3 = new S3Client({
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const cloudfront = new CloudFrontClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Invalidate CloudFront cache for specific deployment
 */
async function invalidateDeploymentCache(distributionId, deploymentId) {
  try {
    const command = new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `invalidation-${deploymentId}-${Date.now()}`,
        Paths: {
          Quantity: 2,
          Items: [
            `/${deploymentId}/*`,
            `/${deploymentId}/index.html`
          ]
        }
      }
    });
    
    await cloudfront.send(command);
    return true;
  } catch (error) {
    console.error("Error invalidating cache:", error);
    return false;
  }
}

/**
 * Fix Vite config to use relative paths
 */
async function fixViteConfig(buildDirectory, deploymentId) {
  const viteConfigPath = path.join(buildDirectory, "vite.config.js");
  const viteConfigTsPath = path.join(buildDirectory, "vite.config.ts");
  
  let configPath = null;
  if (fs.existsSync(viteConfigPath)) {
    configPath = viteConfigPath;
  } else if (fs.existsSync(viteConfigTsPath)) {
    configPath = viteConfigTsPath;
  }
  
  if (configPath) {
    // Read existing config
    let configContent = await fsPromises.readFile(configPath, 'utf8');
    
    // Check if base is already set
    if (configContent.includes('base:')) {
      // Replace existing base with relative path
      configContent = configContent.replace(
        /base:\s*['"][^'"]*['"]/g,
        "base: './'"
      );
    } else {
      // Add base to the config object
      // Find the export default defineConfig({ ... }) pattern
      if (configContent.includes('defineConfig({')) {
        configContent = configContent.replace(
          /defineConfig\(\s*{/,
          "defineConfig({\n  base: './',"
        );
      } else if (configContent.includes('export default {')) {
        configContent = configContent.replace(
          /export default\s*{/,
          "export default {\n  base: './',"
        );
      }
    }
    
    // Write back the modified config
    await fsPromises.writeFile(configPath, configContent, 'utf8');
    return true;
  }
  
  // If no vite.config exists, create one
  const newConfig = `import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
})
`;
  
  await fsPromises.writeFile(viteConfigPath, newConfig, 'utf8');
  return true;
}

/**
 * Fix Create React App by adding homepage to package.json
 */
async function fixCreateReactApp(buildDirectory) {
  const packageJsonPath = path.join(buildDirectory, "package.json");
  
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(await fsPromises.readFile(packageJsonPath, 'utf8'));
    
    // Add homepage field for relative paths
    packageJson.homepage = ".";
    
    await fsPromises.writeFile(
      packageJsonPath, 
      JSON.stringify(packageJson, null, 2), 
      'utf8'
    );
    return true;
  }
  
  return false;
}

/**
 * Get all files recursively
 */
function getAllFiles(folderPath) {
  let response = [];
  const allFilesAndFolders = fs.readdirSync(folderPath);

  allFilesAndFolders.forEach((file) => {
    const fullFilePath = path.join(folderPath, file);
    if (fs.statSync(fullFilePath).isDirectory()) {
      response = response.concat(getAllFiles(fullFilePath));
    } else {
      response.push(fullFilePath);
    }
  });

  return response;
}

/**
 * Search for a folder by name in the repository
 */
function searchForFolder(basePath, targetFolderName) {
  const visited = new Set();
  const queue = [{ currentPath: basePath, depth: 0 }];
  const MAX_DEPTH = 3;

  while (queue.length > 0) {
    const { currentPath, depth } = queue.shift();

    if (depth > MAX_DEPTH || visited.has(currentPath)) continue;
    visited.add(currentPath);

    try {
      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        if (item.startsWith('.') || item === 'node_modules') continue;

        const itemPath = path.join(currentPath, item);

        try {
          const stats = fs.statSync(itemPath);
          
          if (stats.isDirectory()) {
            if (item === targetFolderName) {
              return itemPath;
            }
            
            if (depth < MAX_DEPTH) {
              queue.push({ currentPath: itemPath, depth: depth + 1 });
            }
          }
        } catch (e) {
          continue;
        }
      }
    } catch (e) {
      continue;
    }
  }

  return null;
}

/**
 * Upload a single file to S3
 */
async function uploadFileToS3(filePath, s3Key, bucketName) {
  const fileContent = fs.readFileSync(filePath);
  
  const ext = path.extname(filePath).toLowerCase();
  const contentTypeMap = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };

  const contentType = contentTypeMap[ext] || 'application/octet-stream';

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    Body: fileContent,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  });

  await s3.send(command);
}

/**
 * Main build and deploy process
 */
async function buildAndDeploy(job) {
  const { 
    repoUrl, 
    deploymentId, 
    repoName, 
    branch = "main", 
    buildPath = "",
    backendUrl = "",
    envVariables = "",
    distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID
  } = job.data;
  
  console.log(`Starting build & deploy for: ${deploymentId}`);
  console.log(`Build path parameter: "${buildPath}"`);
  await job.updateProgress(5);
  
  const bucket = process.env.AWS_S3_BUCKET_NAME || "aws-auto-deployer";
  const projectRoot = path.resolve(__dirname, "../..");
  const tempClonePath = path.join(projectRoot, "temp", `clone-${deploymentId}`);
  const finalDistPath = path.join(projectRoot, "dist", deploymentId);
  
  try {
    // Step 1: Clone repository
    await job.log(`Cloning repository: ${repoUrl}`);
    await fsPromises.mkdir(path.dirname(tempClonePath), { recursive: true });
    
    const cloneCommand = `git clone ${repoUrl} "${tempClonePath}"`;
    await execAsync(cloneCommand, { maxBuffer: 1024 * 1024 * 10 });
    await job.updateProgress(15);
    
    // Checkout branch
    if (branch && branch !== "main" && branch !== "master") {
      await job.log(`Checking out branch: ${branch}`);
      await execAsync(`cd "${tempClonePath}" && git checkout ${branch}`);
    }
    
    // Log repository structure
    await job.log("=== Repository Structure ===");
    const rootContents = fs.readdirSync(tempClonePath);
    await job.log(`Root contains: ${rootContents.join(", ")}`);
    
    // Determine build directory
    let buildDirectory;
    
    if (!buildPath || buildPath.trim() === "") {
      buildDirectory = tempClonePath;
      await job.log("Using repository root");
    } else {
      const directPath = path.join(tempClonePath, buildPath);
      
      if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
        buildDirectory = directPath;
        await job.log(`✓ Found at direct path: ${buildPath}`);
      } else {
        await job.log(`Searching for folder: "${buildPath}"...`);
        const foundPath = searchForFolder(tempClonePath, buildPath);
        
        if (foundPath) {
          buildDirectory = foundPath;
          const relativePath = path.relative(tempClonePath, foundPath);
          await job.log(`✓ Found at: ${relativePath}`);
        } else {
          await job.log(`✗ Could not find "${buildPath}"`);
          await job.log(`Available folders: ${rootContents.filter(f => {
            try {
              return fs.statSync(path.join(tempClonePath, f)).isDirectory();
            } catch { return false; }
          }).join(", ")}`);
          throw new Error(`Folder "${buildPath}" not found in repository`);
        }
      }
    }
    
    // Verify package.json
    const packageJsonPath = path.join(buildDirectory, "package.json");
    const hasPackageJson = fs.existsSync(packageJsonPath);
    
    if (!hasPackageJson) {
      await job.log("ℹ️ No package.json found - treating as static site");
      await job.log(`Directory contains: ${fs.readdirSync(buildDirectory).join(", ")}`);
      
      await job.updateProgress(75);
      
      await job.log(`Copying static files to dist/${deploymentId}...`);
      await fsPromises.mkdir(path.dirname(finalDistPath), { recursive: true });
      await fsPromises.cp(buildDirectory, finalDistPath, { recursive: true });
      await job.log("✓ Static files copied");
      
    } else {
      await job.log("✓ package.json found");
      
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const hasBuildScript = packageJson.scripts && packageJson.scripts.build;
      const hasDependencies = packageJson.dependencies || packageJson.devDependencies;
      
      // Detect project type
      const isVite = hasDependencies && (
        packageJson.dependencies?.vite || 
        packageJson.devDependencies?.vite
      );
      const isCRA = hasDependencies && (
        packageJson.dependencies?.['react-scripts'] ||
        packageJson.devDependencies?.['react-scripts']
      );
      
      await job.log(`Has dependencies: ${!!hasDependencies ? 'Yes' : 'No'}`);
      await job.log(`Has build script: ${hasBuildScript ? 'Yes' : 'No'}`);
      if (isVite) await job.log(`Detected: Vite project`);
      if (isCRA) await job.log(`Detected: Create React App`);
      
      // Create .env files with custom variables AND build environment
      let envContent = '';
      let envVarsCount = 0;
      const buildEnv = { ...process.env }; // Start with current environment
      
      // Add backend URL variables if provided
      if (backendUrl) {
        await job.log(`Configuring backend URL: ${backendUrl}`);
        envContent += `REACT_APP_API_URL=${backendUrl}\n`;
        envContent += `VITE_API_URL=${backendUrl}\n`;
        envContent += `NEXT_PUBLIC_API_URL=${backendUrl}\n`;
        
        // Also add to build environment
        buildEnv.REACT_APP_API_URL = backendUrl;
        buildEnv.VITE_API_URL = backendUrl;
        buildEnv.NEXT_PUBLIC_API_URL = backendUrl;
        
        envVarsCount += 3;
      }
      
      // Parse and add custom environment variables
      if (envVariables) {
        await job.log('Parsing custom environment variables...');
        const lines = envVariables.split('\n');
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          // Skip empty lines and comments
          if (!trimmedLine || trimmedLine.startsWith('#')) continue;
          
          // Validate KEY=VALUE format
          if (trimmedLine.includes('=')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            const value = valueParts.join('='); // Handle values with = in them
            
            if (key.trim()) {
              const cleanKey = key.trim();
              const cleanValue = value.trim();
              
              envContent += `${cleanKey}=${cleanValue}\n`;
              buildEnv[cleanKey] = cleanValue; // Add to build environment
              
              envVarsCount++;
              await job.log(`  + ${cleanKey}`);
            }
          } else {
            await job.log(`  ⚠️ Skipping invalid line: ${trimmedLine}`);
          }
        }
      }
      
      // Write environment files if we have any variables
      if (envContent) {
        // Create .env
        const envPath = path.join(buildDirectory, '.env');
        await fsPromises.writeFile(envPath, envContent, 'utf8');
        
        // Also create .env.production for production builds
        const envProdPath = path.join(buildDirectory, '.env.production');
        await fsPromises.writeFile(envProdPath, envContent, 'utf8');
        
        // Create .env.local as well (highest priority)
        const envLocalPath = path.join(buildDirectory, '.env.local');
        await fsPromises.writeFile(envLocalPath, envContent, 'utf8');
        
        await job.log(`✓ ${envVarsCount} environment variable(s) configured`);
        await job.log(`  Files created: .env, .env.production, .env.local`);
        await job.log(`  Variables will be injected into build process`);
      } else {
        await job.log(`ℹ️ No environment variables configured`);
        await job.log(`   Add variables in the deployment form to configure your build`);
      }
      
      // Install dependencies if they exist
      if (hasDependencies) {
        await job.log("Installing dependencies...");
        await job.updateProgress(20);
        
        await execAsync(`cd "${buildDirectory}" && npm install`, {
          maxBuffer: 1024 * 1024 * 50,
          env: buildEnv, // Pass environment variables
        });
        await job.log("✓ Dependencies installed");
        await job.updateProgress(40);
      } else {
        await job.updateProgress(40);
      }
      
      // Fix build configuration for relative paths
      if (isVite) {
        await job.log("Configuring Vite for relative paths...");
        await fixViteConfig(buildDirectory, deploymentId);
        await job.log("✓ Vite config updated");
      } else if (isCRA) {
        await job.log("Configuring Create React App for relative paths...");
        await fixCreateReactApp(buildDirectory);
        await job.log("✓ Package.json updated");
      }
      
      await job.updateProgress(50);
      
      // Build project if build script exists
      if (hasBuildScript) {
        await job.log("Building project...");
        await job.log("Injecting environment variables into build...");
        await execAsync(`cd "${buildDirectory}" && npm run build`, {
          maxBuffer: 1024 * 1024 * 50,
          env: buildEnv, // Pass environment variables to build
        });
        await job.log("✓ Build complete");
        await job.updateProgress(70);
        
        // Find build output
        await job.log("=== Locating Build Output ===");
        const afterBuild = fs.readdirSync(buildDirectory);
        await job.log(`Build directory now contains: ${afterBuild.join(", ")}`);
        
        const possibleBuildDirs = ['dist', 'build', 'out', '.next'];
        let buildOutputDir = null;
        
        for (const dir of possibleBuildDirs) {
          const checkPath = path.join(buildDirectory, dir);
          if (fs.existsSync(checkPath)) {
            buildOutputDir = checkPath;
            await job.log(`✓ Using build output: ${dir}/`);
            break;
          }
        }
        
        if (!buildOutputDir) {
          await job.log("⚠️ No build output folder found, using project root");
          buildOutputDir = buildDirectory;
        }
        
        await job.updateProgress(75);
        
        await job.log(`Copying to dist/${deploymentId}...`);
        await fsPromises.mkdir(path.dirname(finalDistPath), { recursive: true });
        await fsPromises.cp(buildOutputDir, finalDistPath, { recursive: true });
        await job.log("✓ Files copied");
        
      } else {
        await job.log("ℹ️ No build script found - treating as pre-built or static");
        await job.updateProgress(75);
        
        await job.log(`Copying files to dist/${deploymentId}...`);
        await fsPromises.mkdir(path.dirname(finalDistPath), { recursive: true });
        await fsPromises.cp(buildDirectory, finalDistPath, { recursive: true });
        await job.log("✓ Files copied");
      }
    }
    
    // Upload to S3
    await job.log("Uploading to S3...");
    const allFiles = getAllFiles(finalDistPath);
    const totalFiles = allFiles.length;
    let uploadedCount = 0;
    const uploadedFiles = [];
    
    for (const filePath of allFiles) {
      const relativePath = path.relative(finalDistPath, filePath);
      const s3Key = `${deploymentId}/${relativePath.replace(/\\/g, '/')}`;
      
      await uploadFileToS3(filePath, s3Key, bucket);
      
      uploadedCount++;
      uploadedFiles.push(relativePath);
      
      const uploadProgress = 75 + Math.floor((uploadedCount / totalFiles) * 20);
      await job.updateProgress(uploadProgress);
      
      if (uploadedCount % 10 === 0) {
        await job.log(`Uploaded ${uploadedCount}/${totalFiles} files`);
      }
    }
    
    await job.log("✓ Upload complete");
    await job.updateProgress(95);
    
    // CloudFront invalidation
    let cloudFrontUrl = null;
    
    if (distributionId) {
      await job.log("Invalidating CloudFront cache...");
      const invalidated = await invalidateDeploymentCache(distributionId, deploymentId);
      
      if (invalidated) {
        await job.log("✓ Cache invalidated");
        cloudFrontUrl = `https://${process.env.CLOUDFRONT_DOMAIN || 'd2xycbl0v7dc9v.cloudfront.net'}/${deploymentId}/index.html`;
        await job.log(`CloudFront URL: ${cloudFrontUrl}`);
      }
    }
    
    // Cleanup
    await job.log("Cleaning up...");
    await fsPromises.rm(tempClonePath, { recursive: true, force: true });
    
    await job.updateProgress(100);
    
    const s3DirectUrl = `https://${bucket}.s3.${process.env.AWS_REGION || 'eu-north-1'}.amazonaws.com/${deploymentId}/index.html`;
    
    await job.log(`=== SUCCESS ===`);
    await job.log(`Deployment ID: ${deploymentId}`);
    if (cloudFrontUrl) {
      await job.log(`URL: ${cloudFrontUrl}`);
      await job.log(`(CloudFront may take 1-2 minutes to propagate)`);
    } else {
      await job.log(`S3 URL: ${s3DirectUrl}`);
    }
    
    return {
      success: true,
      deploymentId,
      repoName,
      bucket,
      totalFiles,
      uploadedCount,
      s3Url: s3DirectUrl,
      cloudFrontUrl,
      cloudFrontDistributionId: distributionId,
      s3Path: `s3://${bucket}/${deploymentId}/`,
      localPath: finalDistPath,
      uploadedFiles: uploadedFiles.slice(0, 20),
    };
    
  } catch (error) {
    await job.log(`=== ERROR ===`);
    await job.log(error.message);
    
    try {
      if (fs.existsSync(tempClonePath)) {
        await fsPromises.rm(tempClonePath, { recursive: true, force: true });
      }
      if (fs.existsSync(finalDistPath)) {
        await fsPromises.rm(finalDistPath, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }
    
    throw error;
  }
}

export const deployWorker = new Worker("build-and-deploy", buildAndDeploy, {
  connection,
  concurrency: 2,
});

deployWorker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed successfully!`);
});

deployWorker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

deployWorker.on("progress", (job, progress) => {
  console.log(`📊 Job ${job.id} progress: ${progress}%`);
});

console.log("🚀 Build & Deploy Worker started. Waiting for jobs...");
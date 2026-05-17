import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, the bundled server.cjs is located inside the 'dist' folder.
    // However, depending on how it's executed, process.cwd() might be root or dist.
    
    // Determine the path to the static assets (dist folder)
    // When running node dist/server.cjs, __dirname is the absolute path to dist/
    const distPath = path.resolve(__dirname);
    
    console.log(`[PROD] Mode Active`);
    console.log(`[PROD] Current Work Dir (CWD): ${process.cwd()}`);
    console.log(`[PROD] Server Dir (__dirname): ${__dirname}`);
    console.log(`[PROD] Serving static files from: ${distPath}`);
    
    if (fs.existsSync(path.join(distPath, "index.html"))) {
      console.log(`[PROD] index.html found at ${path.join(distPath, "index.html")}`);
    } else {
      console.error(`[PROD] CRITICAL ERROR: index.html NOT FOUND at ${path.join(distPath, "index.html")}`);
      // Fallback: try CWD/dist if __dirname failed
      const fallbackPath = path.join(process.cwd(), 'dist');
      console.log(`[PROD] Attempting fallback to: ${fallbackPath}`);
      if (fs.existsSync(path.join(fallbackPath, "index.html"))) {
        console.log(`[PROD] index.html found at fallback path!`);
      }
    }

    app.use(express.static(distPath));
    
    // Explicitly handle root to ensure it serves index.html
    app.get("/", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send(`Production assets missing at ${indexPath}. Please redeploy.`);
      }
    });

    // Catch-all route for SPA fallback
    app.get("*", (req, res, next) => {
      // Don't fallback for API routes
      if (req.path.startsWith('/api')) {
        return next();
      }
      
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        // Log the failure to help debug
        console.error(`[PROD] 404: Static file or SPA fallback missing. Path: ${req.path}, Searching in: ${indexPath}`);
        res.status(404).send("Application static files missing. Please redeploy.");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

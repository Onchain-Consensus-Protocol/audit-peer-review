import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({server:{host:true,port:5174},build:{rollupOptions:{input:["index.html","audit-review.html","review-stake.html"]}},plugins:[react()]});

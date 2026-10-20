import { defineConfig as define_config } from 'vite';
export default define_config({clearScreen: false, server: {port: 1420, strictPort: true}, build: {target: 'es2022'}});
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/lib.js'],
    format: ['cjs'],
    outDir: 'dist-cjs',
    dts: false,
    clean: true,
});

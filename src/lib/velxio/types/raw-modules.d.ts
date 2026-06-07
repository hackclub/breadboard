// @ts-nocheck
declare module "*.c?raw" {
  const source: string;
  export default source;
}

declare module "*.json?raw" {
  const source: string;
  export default source;
}

declare module "*.wasm?url" {
  const url: string;
  export default url;
}

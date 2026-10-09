// bun:test 的最小类型声明：本模板用 Bun 跑测试，但未引入 @types/bun，
// 这里补上测试文件用到的几个导出，避免 tsc 报「Cannot find module 'bun:test'」。
declare module "bun:test" {
  export const test: (name: string, fn: () => void | Promise<void>) => void;
  export const describe: (name: string, fn: () => void) => void;
  export const beforeEach: (fn: () => void | Promise<void>) => void;
  export const afterEach: (fn: () => void | Promise<void>) => void;
  export const beforeAll: (fn: () => void | Promise<void>) => void;
  export const afterAll: (fn: () => void | Promise<void>) => void;
  // 匹配器链较长，这里用 any 让 expect(...).toBe / .toEqual 等直接可用。
  export function expect<T>(actual: T): any;
}

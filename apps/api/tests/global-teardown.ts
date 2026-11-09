export default async function globalTeardown() {
  await globalThis.__MONGO_MEMORY__?.stop();
}

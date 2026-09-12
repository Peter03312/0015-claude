// 等待 web 服务就绪（Node 20 内置 fetch，无外部依赖）
const url = process.env.WAIT_URL ?? 'http://web:80';
const deadline = Date.now() + 60_000;

for (;;) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      console.log(`web 服务已就绪：${url}`);
      process.exit(0);
    }
  } catch {
    // 尚未就绪，继续等待
  }
  if (Date.now() > deadline) {
    console.error(`等待 ${url} 超时`);
    process.exit(1);
  }
  await new Promise(r => setTimeout(r, 500));
}

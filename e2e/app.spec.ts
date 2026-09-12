import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('录入：合法孔序实时得出唯一可装相位，含移动孔数、箭头新位置与全部孔对', async ({ page }) => {
  // 首尾及连续空格应被忽略
  await page.getByTestId('ref-seq').fill('  A  B   C D ');
  await page.getByTestId('cand-seq').fill('B C D A');

  await expect(page.getByTestId('ref-count')).toHaveText('已解析 4 孔');
  await expect(page.getByTestId('cand-count')).toHaveText('已解析 4 孔');

  const result = page.getByTestId('result-unique');
  await expect(result).toBeVisible();
  await expect(result).toContainText('可装');
  await expect(result).toContainText('移动孔数：顺时针 1 孔');
  await expect(result).toContainText('箭头新位置：参考环索引 1');
  // 全部孔对：参考索引 0..3 对应待装索引 3,0,1,2
  const rows = page.getByTestId('pairs').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveText(/0\s*A\s*3\s*A/);
  await expect(rows.nth(1)).toHaveText(/1\s*B\s*0\s*B/);
  await expect(rows.nth(3)).toHaveText(/3\s*D\s*2\s*D/);

  // 调整待装版箭头起始孔，结论随编辑立即更新（k 由 1 变为 2）
  await page.getByTestId('cand-arrow').selectOption('1');
  await expect(result).toContainText('移动孔数：顺时针 2 孔');
  await expect(result).toContainText('箭头新位置：参考环索引 2');
});

test('纠错：非法字符、孔数越界、孔数不同依次报错，修正后恢复结论', async ({ page }) => {
  await page.getByTestId('ref-seq').fill('A B E D');
  await page.getByTestId('cand-seq').fill('A B C D');
  const error = page.getByTestId('error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('非法');
  await expect(error).toContainText('参考版');
  await expect(page.getByTestId('result-unique')).toHaveCount(0);

  // 修正非法字符后，孔数不同立即报错
  await page.getByTestId('ref-seq').fill('A B C D');
  await page.getByTestId('cand-seq').fill('A B C D A');
  await expect(error).toContainText('两环孔数必须相同');

  // 孔数越界
  await page.getByTestId('cand-seq').fill('A B C');
  await expect(error).toContainText('4–48');

  // 全部修正后错误消失并给出结论
  await page.getByTestId('cand-seq').fill('B C D A');
  await expect(page.getByTestId('error')).toHaveCount(0);
  await expect(page.getByTestId('result-unique')).toBeVisible();
});

test('三类结果互斥：可装 / 无匹配 / 相位不唯一', async ({ page }) => {
  const unique = page.getByTestId('result-unique');
  const none = page.getByTestId('result-none');
  const multiple = page.getByTestId('result-multiple');

  // 可装
  await page.getByTestId('ref-seq').fill('A B C D');
  await page.getByTestId('cand-seq').fill('B C D A');
  await expect(unique).toBeVisible();
  await expect(none).toHaveCount(0);
  await expect(multiple).toHaveCount(0);

  // 无匹配：诊断相位 k=0，错 2 孔，首个错孔为参考索引 2
  await page.getByTestId('ref-seq').fill('A A A B');
  await page.getByTestId('cand-seq').fill('A A C D');
  await expect(none).toBeVisible();
  await expect(none).toContainText('无匹配');
  await expect(none).toContainText('k = 0');
  await expect(none).toContainText('共 2 孔不符');
  await expect(none).toContainText('首个错孔：参考索引 2，参考孔 A ≠ 待装孔 C');
  await expect(unique).toHaveCount(0);
  await expect(multiple).toHaveCount(0);

  // 相位不唯一：ABAB 周期序列，k = 0、2
  await page.getByTestId('ref-seq').fill('A B A B');
  await page.getByTestId('cand-seq').fill('A B A B');
  await expect(multiple).toBeVisible();
  await expect(multiple).toContainText('相位不唯一');
  await expect(multiple).toContainText('k = 0、2');
  await expect(unique).toHaveCount(0);
  await expect(none).toHaveCount(0);
});

test('结果失效：编辑任一输入立即清除旧结论', async ({ page }) => {
  await page.getByTestId('ref-seq').fill('A B C D');
  await page.getByTestId('cand-seq').fill('B C D A');
  await expect(page.getByTestId('result-unique')).toBeVisible();

  // 编辑参考版引入非法字符：旧结论立即消失，仅显示错误
  await page.getByTestId('ref-seq').fill('A B C D X');
  await expect(page.getByTestId('result-unique')).toHaveCount(0);
  await expect(page.getByTestId('error')).toBeVisible();

  // 修复后得到新结论；再编辑待装版为周期序列，旧的可装结论被“相位不唯一”替换
  await page.getByTestId('ref-seq').fill('A B A B');
  await page.getByTestId('cand-seq').fill('A B A B');
  await expect(page.getByTestId('result-unique')).toHaveCount(0);
  await expect(page.getByTestId('result-multiple')).toBeVisible();

  // 清空任一输入：所有结论消失，回到待录入状态
  await page.getByTestId('cand-seq').fill('');
  await expect(page.getByTestId('result-multiple')).toHaveCount(0);
  await expect(page.getByTestId('error')).toHaveCount(0);
  await expect(page.getByTestId('idle')).toBeVisible();
});

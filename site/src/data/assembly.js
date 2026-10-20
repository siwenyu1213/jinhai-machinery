export const assemblyStops = [
  { at: 0, title: '完整的配合', description: '三个卡爪围绕中心排布，把各自的运动汇成一次夹持。' },
  { at: .55, title: '展开，看到里面', description: '卡爪、盘件与壳体逐层分离，沿着装配的方向，看清零件之间的关系。' },
  { at: 1, title: '回到恰好的位置', description: '每一个独立零件归位，重新组成一只完整的三爪卡盘。' },
];

const clamp = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const smooth = (start, end, value) => {
  const amount = clamp((value - start) / (end - start));
  return amount * amount * (3 - 2 * amount);
};

export function assemblyPose(value) {
  const progress = clamp(value);
  const opening = smooth(.08, .48, progress);
  const closing = 1 - smooth(.70, .97, progress);
  return {
    progress,
    spread: opening * closing,
    jaw: smooth(.08, .37, progress) * (1 - smooth(.79, .97, progress)),
    cover: smooth(.14, .43, progress) * (1 - smooth(.72, .91, progress)),
    scroll: smooth(.23, .48, progress) * (1 - smooth(.70, .86, progress)),
    phase: progress < .12 ? 0 : progress < .72 ? 1 : 2,
  };
}

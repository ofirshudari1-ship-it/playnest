const si = require('systeminformation');

function scoreGpu(graphics) {
  const gpu = graphics.controllers?.[0];
  if (!gpu) return { tier: 'Unknown', vramGb: 0, model: 'Unknown' };
  const vramGb = Math.round((gpu.vram || 0) / 1024);
  const model = gpu.model || 'Unknown GPU';
  const isDiscreteHint = /nvidia|geforce|rtx|gtx|radeon|rx\s?\d{3,4}/i.test(model);

  let tier = 'Entry-Level';
  if (vramGb >= 10 || /rtx 40|rtx 50|rx 7\d00|rx 9\d00/i.test(model)) tier = 'Enthusiast';
  else if (vramGb >= 6 || /rtx 30|rtx 20|gtx 16|rx 6\d00|rx 5\d00/i.test(model)) tier = 'High-End';
  else if (vramGb >= 3 && isDiscreteHint) tier = 'Mid-Range';

  return { tier, vramGb, model };
}

function scoreRam(memGb) {
  if (memGb >= 32) return 'Excellent';
  if (memGb >= 16) return 'Good';
  if (memGb >= 8) return 'Adequate';
  return 'Limited';
}

function scoreCpu(cpu) {
  const cores = cpu.physicalCores || cpu.cores || 1;
  const speed = cpu.speedMax || cpu.speed || 0;
  let tier = 'Entry-Level';
  if (cores >= 8 && speed >= 3.5) tier = 'Enthusiast';
  else if (cores >= 6 && speed >= 3) tier = 'High-End';
  else if (cores >= 4) tier = 'Mid-Range';
  return { tier, cores, speed };
}

const TIER_SCORE = { 'Entry-Level': 25, 'Mid-Range': 50, 'High-End': 75, Enthusiast: 100, Unknown: 40 };

async function getHardwareProfile() {
  const [cpuData, memData, graphicsData, osData, diskData] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.graphics(),
    si.osInfo(),
    si.diskLayout()
  ]);

  const memGb = Math.round(memData.total / 1024 / 1024 / 1024);
  const cpuTier = scoreCpu(cpuData);
  const gpuTier = scoreGpu(graphicsData);
  const ramLabel = scoreRam(memGb);

  const overall = Math.round((TIER_SCORE[cpuTier.tier] + TIER_SCORE[gpuTier.tier] + Math.min(100, memGb * 4)) / 3);

  let overallLabel = 'Entry-Level Rig';
  if (overall >= 80) overallLabel = 'Enthusiast Gaming Rig';
  else if (overall >= 60) overallLabel = 'High-End Gaming PC';
  else if (overall >= 40) overallLabel = 'Solid Mid-Range PC';

  return {
    os: `${osData.distro} ${osData.release} (${osData.arch})`,
    cpu: { model: cpuData.manufacturer + ' ' + cpuData.brand, ...cpuTier },
    gpu: gpuTier,
    ramGb: memGb,
    ramLabel,
    storage: diskData.map((d) => ({ name: d.name, type: d.type, sizeGb: Math.round((d.size || 0) / 1024 / 1024 / 1024) })),
    overallScore: overall,
    overallLabel
  };
}

module.exports = { getHardwareProfile };

const image = (name) => `${import.meta.env.BASE_URL}images/${name}.svg`;
export const services = {
  custom: { title: '非标零配件与设备定制', image: image('custom'), description: '先准备图纸或照片、尺寸、数量与材料要求。设备定制的具体范围需进一步沟通。' },
  sheet: { title: '钣金定制', image: image('sheet'), description: '先说明板材、板厚、形状与用途，再沟通切割、折弯及焊接要求。' },
  repair: { title: '维修服务', image: image('repair'), description: '先提供机台类型、故障现象、照片与所在区域。上门范围限晋江、南安、石狮、鲤城、丰泽。' },
};
export const steps = [
  '轮廓：先明确形状与尺寸要求。',
  '切割：按沟通的轮廓讨论下料方式。',
  '折弯：根据形状与装配需求讨论成形。',
  '焊接：按具体需求讨论连接与处理方式。',
];
export const checklist = '【学习演示：需求资料清单】\n非标定制：图纸或照片、尺寸、材料、数量。\n钣金加工：板材、板厚、形状与用途。\n机台维修：机台类型、故障现象、照片、所在区域。\n上门维修范围：晋江、南安、石狮、鲤城、丰泽；超出范围不接。\n本清单仅供学习，不会提交任何资料。';

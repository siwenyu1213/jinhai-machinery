const image = (name) => `${import.meta.env.BASE_URL}images/${name}.webp`;
const photographs = {
  parts: { image: image('parts'), alt: '轴套与紧固件的金属细节，图库参考摄影', credit: 'Matt Richmond / Unsplash', source: 'https://unsplash.com/photos/a-pile-of-metal-parts-sitting-next-to-each-other-fx-F1sWUW0Y' },
  lathe: { image: image('lathe'), alt: '车床刀架、导轨与手轮的摄影细节，非本厂实拍', credit: 'LISK OBE / Unsplash', source: 'https://unsplash.com/photos/close-up-of-an-old-metal-lathe-in-a-workshop-_VBsh_IKsD8' },
  cutting: { image: image('cutting'), alt: '激光切割头在金属板上切割的摄影细节，非本厂设备', credit: 'Cemrecan Yurtman / Unsplash', source: 'https://unsplash.com/photos/a-machine-cutting-a-piece-of-metal-with-sparks-thdb7o0nLyc' },
  welding: { image: image('welding'), alt: '金属管件与板材连接处的焊接摄影细节，非本厂实拍', credit: 'Rodrigo Rodrigues / Unsplash', source: 'https://unsplash.com/photos/a-person-welding-a-metal-object-with-a-welding-torch-dmgYI2uuOoY' },
};
export const services = {
  custom: { title: '非标零配件与设备定制', ...photographs.parts, description: '先准备图纸或照片、尺寸、数量与材料要求。设备定制的具体范围需进一步沟通。' },
  sheet: { title: '钣金定制', ...photographs.cutting, description: '先说明板材、板厚、形状与用途，再沟通切割、折弯及焊接要求。' },
  repair: { title: '维修服务', ...photographs.lathe, description: '先提供机台类型、故障现象、照片与所在区域。上门范围限晋江、南安、石狮、鲤城、丰泽。' },
};
export const steps = [
  { ...photographs.lathe, label: '机床 / 刀架与导轨', description: '机床加工：从形状与尺寸要求出发，沟通适合的加工方式。' },
  { ...photographs.cutting, label: '切割 / 板材与切口', description: '激光切割：先明确板材、板厚与轮廓，再确认具体下料要求。' },
  { ...photographs.welding, label: '焊接 / 管件与连接', description: '焊接连接：结合连接部位与用途，沟通焊接工艺及处理方式。' },
];
export const checklist = '【学习演示：需求资料清单】\n非标定制：图纸或照片、尺寸、材料、数量。\n钣金加工：板材、板厚、形状与用途。\n机台维修：机台类型、故障现象、照片、所在区域。\n上门维修范围：晋江、南安、石狮、鲤城、丰泽；超出范围不接。\n本清单仅供学习，不会提交任何资料。';

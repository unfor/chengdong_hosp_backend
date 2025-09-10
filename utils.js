import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

/**
 * 解析Excel文件，提取数据和内嵌图片并将图片转为Base64
 * @param {string} filePath - Excel文件的路径
 * @returns {Promise<{data: Array, images: Object, formulas: Object}>} - 包含表格数据、图片Base64和公式信息的对象
 */
async function parseExcelWithImages(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath, {
    sharedStrings: true, // 解析共享字符串（处理中文）
    hyperlinks: true, // 解析超链接
    worksheets: true,
    styles: false, // 关闭样式解析（提升性能）
    drawings: true, // 启用绘图解析
    autoFilter: true,
    richText: true,
    getImageData: true, // 确保能够获取图片数据
  });

  const worksheet = workbook.getWorksheet(1);
  const dataKey = ["name", "department", "position", "avatar"];
  const data = [];
  const images = {};
  const imageFormulas = {}; // 存储DISPIMG公式引用的图片
  const allMedia = {}; // 存储所有可能的媒体数据

  // 处理表格数据
  worksheet.eachRow((row, rowNumber) => {
    const rowData = {};
    if (rowNumber > 1) {
      row.eachCell((cell, colNumber) => {
        if (
          cell.formula &&
          typeof cell.formula === "string" &&
          cell.formula.includes("DISPIMG")
        ) {
          const match = cell.formula.match(/"([^"]+)"/);
          if (match && match[1]) {
            const imageId = match[1];
            imageFormulas[imageId] = {
              row: rowNumber,
              col: colNumber,
              address: cell.address,
            };
          }
          // 跳过标题行
          const key = dataKey[colNumber - 1];
          rowData[key] = cell.value;
        } else {
          // 非DISPIMG公式，直接存储值
          const key = dataKey[colNumber - 1];
          rowData[key] = cell.value;
        }
      });
    }
    data.push(rowData);
  });

  // 检查是否有media属性
  // 目前发现通过wps导出的xlsx文件中，单元格内嵌的图片会存储在workbook.media中
  if (workbook.media) {
    workbook.media.forEach((media, index) => {
      allMedia[`media_${index}`] = {
        type: media.type,
        length: media.buffer ? media.buffer.length : 0,
      };

      // 尝试直接从media中提取图片数据
      if (media.buffer) {
        try {
          const base64Image = Buffer.from(media.buffer).toString("base64");
          const imageKey = `media_${index}`;
          images[imageKey] = {
            base64: base64Image,
            type: media.type || "image/jpeg",
            source: "workbook.media",
          };
        } catch (error) {
          console.error(`提取media图片时出错:`, error);
        }
      }
    });
  }
  // 创建映射，将行号和列号映射到对应的图片
  const imageByPosition = {};

  // 如果有图片和公式信息，建立映射关系
  if (Object.keys(images).length > 0 && Object.keys(imageFormulas).length > 0) {
    // 将图片与行数据关联
    Object.entries(imageFormulas).forEach(([imageId, formulaInfo], index) => {
      const { row, col } = formulaInfo;
      const positionKey = `${row}_${col}`;

      // 找到对应的图片
      let matchedImage = null;

      // 方法1: 如果有相同ID的图片
      if (images[imageId]) {
        matchedImage = images[imageId];
      }
      // 方法2: 如果没有相同ID的图片，使用顺序匹配
      else if (Object.values(images)[index]) {
        matchedImage = Object.values(images)[index];
      }
      // 方法3: 如果以上都不匹配，使用第一张图片
      else if (Object.values(images)[0]) {
        matchedImage = Object.values(images)[0];
      }
      if (matchedImage) {
        imageByPosition[positionKey] = matchedImage;
      }
    });
  } else if (Object.keys(images).length > 0) {
    // 如果只有图片没有公式信息，按顺序关联
    console.log(`只有图片(${Object.keys(images).length}张)，没有公式信息`);
  }
  // 将图片数据直接存储到data数组的对应位置
  for (const positionKey in imageByPosition) {
    const [rowStr, colStr] = positionKey.split("_");
    const rowIndex = parseInt(rowStr) - 1; // 转换为0-based索引
    const colIndex = parseInt(colStr) - 1;

    if (data[rowIndex] && data[rowIndex]["avatar"] !== undefined) {
      // 在对应位置存储图片数据和原始值
      data[rowIndex]["avatar"] = imageByPosition[positionKey].base64;
    }
  }
  return data;
}

// 测试函数
// parseExcelWithImages("./staff_example.xlsx")
//   .then((res) => {
//     console.log("\n--- 解析结果 ---\n");
//     console.log(`总共解析了 ${res.data.length} 行数据`);

//     // 检查是否有包含图片的单元格
//     const imageCells = [];
//     res.data.forEach((row, rowIndex) => {
//       row.forEach((cell, colIndex) => {
//         if (cell && typeof cell === 'object' && cell.image) {
//           imageCells.push({ row: rowIndex + 1, col: colIndex + 1 });
//         }
//       });
//     });

//     if (imageCells.length > 0) {
//       console.log(`找到 ${imageCells.length} 个包含图片的单元格:`);
//       imageCells.forEach(cell => {
//         console.log(`- 行 ${cell.row}, 列 ${cell.col}`);
//       });
//     } else {
//       console.log("没有找到包含图片的单元格");
//     }

//     // 输出部分结果用于调试
//     if (res.data.length > 0) {
//       console.log("\n第一行数据:", res.data[0]);
//       // 如果有图片，显示部分图片信息
//       if (res.images && Object.keys(res.images).length > 0) {
//         const firstImage = Object.values(res.images)[0];
//         console.log("\n第一张图片信息:");
//         console.log(`- 类型: ${firstImage.type}`);
//         console.log(`- Base64长度: ${firstImage.base64 ? firstImage.base64.length : 0}`);
//         console.log(`- 来源: ${firstImage.source}`);
//       }
//     }
//   })
//   .catch((err) => {
//     console.error("解析Excel时出错:", err);
//   });

export { parseExcelWithImages };

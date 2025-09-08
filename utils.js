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
  const data = [];
  const images = {};
  const imageFormulas = {}; // 存储DISPIMG公式引用的图片
  const allMedia = {}; // 存储所有可能的媒体数据

  // 处理表格数据
  worksheet.eachRow((row, rowNumber) => {
    const rowData = [];
    row.eachCell((cell, colNumber) => {
      // 尝试多种方式检测DISPIMG公式
      let foundFormula = false;

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
          console.log(`方式1 - 找到DISPIMG公式: ID=${imageId}`);
          foundFormula = true;
        }
      }

      if (!foundFormula && cell.value && cell.value.result) {
        const result = cell.value.result;
        if (typeof result === "string" && result.includes("DISPIMG")) {
          const match = result.match(/"([^"]+)"/);
          if (match && match[1]) {
            const imageId = match[1];
            imageFormulas[imageId] = {
              row: rowNumber,
              col: colNumber,
              address: cell.address,
            };
            console.log(`方式2 - 找到DISPIMG公式: ID=${imageId}`);
            foundFormula = true;
          }
        }
      }

      rowData.push(cell.value);
    });
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
          console.log(`成功从workbook.media提取图片: ${imageKey}`);
        } catch (error) {
          console.error(`提取media图片时出错:`, error);
        }
      }
    });
  }

  // 检查model对象的其他属性
  if (workbook.model) {
    // 检查是否有media相关属性
    if (workbook.model.media) {
      // 尝试从workbook.model.media中提取图片数据
      workbook.model.media.forEach((media, index) => {
        if (media.buffer && !images[`model_media_${index}`]) {
          try {
            const base64Image = Buffer.from(media.buffer).toString("base64");
            const imageKey = `model_media_${index}`;
            images[imageKey] = {
              base64: base64Image,
              type: media.type || "image/jpeg",
              source: "workbook.model.media",
            };
            console.log(`成功从workbook.model.media提取图片: ${imageKey}`);
          } catch (error) {
            console.error(`提取model.media图片时出错:`, error);
          }
        }
      });
    }
  }

  // 方法1: 尝试通过ExcelJS的内置方法获取图片
  try {
    // 检查workbook对象中的图片相关属性
    if (workbook.model && workbook.model.images) {
      Object.entries(workbook.model.images).forEach(
        ([imageId, image], index) => {
          if (image && image.buffer) {
            const base64Image = image.buffer.toString("base64");
            let mimeType = "image/png";
            if (image.extension === "jpg" || image.extension === "jpeg") {
              mimeType = "image/jpeg";
            } else if (image.extension === "gif") {
              mimeType = "image/gif";
            }

            // 关联到之前找到的DISPIMG公式
            const formulaInfo = imageFormulas[imageId];

            images[index] = {
              id: imageId,
              base64: `data:${mimeType};base64,${base64Image}`,
              mimeType: mimeType,
              extension: image.extension,
              formulaInfo: formulaInfo,
            };
          }
        }
      );
    } else {
      console.log("workbook.model.images: 不存在");
    }

    // 方法2: 尝试从drawings中获取图片
    if (worksheet.drawings && worksheet.drawings.length > 0) {
      worksheet.drawings.forEach((drawing, index) => {
        try {
          if (drawing.imageId && workbook.model && workbook.model.images) {
            const image = workbook.model.images[drawing.imageId];
            if (image && image.buffer) {
              const base64Image = image.buffer.toString("base64");
              let mimeType = "image/png";
              if (image.extension === "jpg" || image.extension === "jpeg") {
                mimeType = "image/jpeg";
              }

              // 如果这个图片还没有被添加到images中
              if (
                !Object.values(images).some((img) => img.id === drawing.imageId)
              ) {
                images[Object.keys(images).length] = {
                  id: drawing.imageId,
                  base64: `data:${mimeType};base64,${base64Image}`,
                  mimeType: mimeType,
                  extension: image.extension,
                  position: {
                    top: drawing.top,
                    left: drawing.left,
                    width: drawing.width,
                    height: drawing.height,
                  },
                };
              }
            }
          }
        } catch (err) {
          console.error(`处理drawing ${index} 时出错:`, err);
        }
      });
    } else {
      console.log("worksheet.drawings: 不存在");
    }
  } catch (error) {
    console.error("提取图片时出错:", error);
  }

  // 创建优化的返回结果格式
  const result = {
    data,
    images: {},
    formulas: {},
    mediaInfo: {
      hasMedia: Object.keys(images).length > 0,
      totalMediaItems: Object.keys(allMedia).length,
      totalFormulas: Object.keys(imageFormulas).length,
      exceljsVersion: "4.4.0",
      notes:
        "Excel文件中的图片可能是通过DISPIMG函数特殊引用的，这些图片已尽力提取",
    },
  };

  // 添加提取的图片
  if (Object.keys(images).length > 0) {
    result.images = images;
  }

  // 添加找到的DISPIMG公式信息
  if (Object.keys(imageFormulas).length > 0) {
    result.formulas = imageFormulas;

    // 如果没有匹配的图片，添加一个提示
    if (Object.keys(images).length === 0) {
      result.mediaInfo.message =
        "找到了DISPIMG公式引用，但无法直接关联到图片数据。请考虑使用公式ID在其他系统中查找对应图片。";
    }
  }

  return result;
}

parseExcelWithImages("./staff_example.xlsx")
  .then((res) => {
    console.log(res);
  })
  .catch((err) => {
    console.log(err);
  });

export { parseExcelWithImages };

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { fileList } = event;
  if (!fileList || fileList.length === 0) {
    return { fileList: [] };
  }
  try {
    const res = await cloud.getTempFileURL({ fileList });
    return { fileList: res.fileList };
  } catch (err) {
    console.error('getTempFileUrls error:', err);
    return { fileList: [] };
  }
};

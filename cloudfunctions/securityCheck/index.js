const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 内容安全检测
 * type: 'image' | 'text'
 * content: 图片 fileID | 文本内容
 */
exports.main = async (event) => {
  const { type, content } = event;

  try {
    if (type === 'text') {
      try {
        const res = await cloud.openapi.security.msgSecCheck({
          content: content
        });
        console.log('[安全检测-文本] 结果:', JSON.stringify(res));
        return { errcode: res.errcode || 0, errmsg: res.errmsg || '' };
      } catch (innerErr) {
        console.error('[安全检测-文本] 调用失败:', innerErr);
        // 87014 是违规内容，属于正常业务返回，不是异常
        const errMsg = innerErr.message || '';
        if (errMsg.includes('87014') || errMsg.includes('risky')) {
          return { errcode: 87014, errmsg: '内容包含违规信息' };
        }
        return { errcode: -10, errmsg: errMsg };
      }
    }

    if (type === 'image') {
      try {
        const { fileContent } = await cloud.downloadFile({
          fileID: content,
        });
        const res = await cloud.openapi.security.imgSecCheck({
          media: {
            contentType: 'image/png',
            value: fileContent,
          }
        });
        console.log('[安全检测-图片] 结果:', JSON.stringify(res));
        return { errcode: res.errcode || 0, errmsg: res.errmsg || '' };
      } catch (innerErr) {
        console.error('[安全检测-图片] 调用失败:', innerErr);
        const errMsg = innerErr.message || '';
        if (errMsg.includes('87014') || errMsg.includes('risky')) {
          return { errcode: 87014, errmsg: '图片包含违规内容' };
        }
        return { errcode: -10, errmsg: errMsg };
      }
    }

    return { errcode: -1, errmsg: '未知检测类型' };
  } catch (err) {
    console.error('[securityCheck] 错误:', err);
    return { errcode: -3, errmsg: err.message || '检测失败' };
  }
};

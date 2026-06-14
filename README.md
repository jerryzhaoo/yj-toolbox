# yj-toolbox（裕二菌提效工具箱）

基于微信云开发的拼团报名工具小程序，支持发起拼团活动、月卡转让、社群管理、管理员后台、转账提醒订阅消息等功能。

## 功能

### 拼团活动
- 发布拼团活动（如停车、课包等类型）
- 查看活动详情，参与拼团
- 管理自己的拼团帖子（编辑、删除）
- 拼团提醒订阅消息

### 月卡转让
- 发布月卡转让信息
- 转让自动发送订阅消息提醒
- 展示完整的卡号和姓名信息

### 社群管理
- 社群列表展示与加入
- 社群信息发布到首页

### 管理后台
- 管理员配置（添加/移除管理员）
- 活动管理（编辑、删除活动）
- 参与者管理（编辑、删除参与者）
- 数据初始化工具

### 其他
- 首页 Banner 展示
- 用户信息编辑
- 地理位置定位

## 技术栈

- **框架**: 微信小程序原生框架
- **后端**: 微信云开发（CloudBase）
- **数据库**: 腾讯云 MongoDB（云数据库）
- **云函数**: 微信云函数（Node.js）
- **缓存**: 本地存储 + 内存缓存（TTL 机制）

## 项目结构

```
yj-toolbox/
├── cloudfunctions/           # 云函数
│   ├── activateAdmin/        # 激活管理员
│   ├── deleteActivity/       # 删除活动
│   ├── deleteParticipant/    # 删除参与者
│   ├── getOpenid/            # 获取用户 openid
│   ├── getTempFileUrls/      # 获取临时文件 URL
│   ├── removeAdmin/          # 移除管理员
│   ├── saveCommunity/        # 保存社群信息
│   ├── sendTransferReminder/ # 发送转让提醒
│   ├── updateActivity/       # 更新活动
│   └── updateParticipant/    # 更新参与者
├── pages/                    # 页面
│   ├── index/                # 首页（拼团列表、Banner、社群）
│   ├── profile/              # 我的（个人信息、我的帖子、管理员入口）
│   ├── group-detail/         # 拼团详情
│   ├── post-detail/          # 帖子详情
│   ├── publish/              # 发布拼团
│   ├── my-posts/             # 我的帖子
│   ├── user-info-edit/       # 编辑用户信息
│   ├── init-data/            # 数据初始化（管理）
│   ├── banner-detail/        # Banner 详情
│   ├── help/                 # 帮助页面
│   └── community/            # 社群
├── utils/                    # 工具
│   ├── cache.js              # 缓存工具（TTL 缓存）
│   └── util.js               # 通用工具函数
├── app.js                    # 小程序入口
├── app.json                  # 全局配置
└── app.wxss                  # 全局样式
```

## 开发

```bash
# 克隆项目
git clone https://github.com/jerryzhaoo/yj-toolbox.git

# 使用微信开发者工具打开 yj-toolbox 目录
# 在开发者工具中：
# 1. 填入 AppID: wx747f7a0440b07289
# 2. 开启云开发，关联云环境
# 3. 上传并部署所有云函数
```

### 云函数权限

部分云函数使用了 `subscribeMessage.send` API，需要确保云函数目录下有 `config.json` 配置了相应权限。

## 微信小程序

- **名称**: 裕二菌提效工具箱
- **AppID**: wx747f7a0440b07289
- **云环境**: 微信云开发

## License

MIT

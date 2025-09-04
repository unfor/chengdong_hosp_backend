# 城东医院管理系统后端
这是城东医院管理系统的后端服务，提供API接口给前端使用。

## 技术栈
- Node.js + Express
- SQLite3 (数据库)

## 项目结构
```
chengdong_hosp_backend/
├── server.js          # 后端服务器入口文件
├── package.json       # 项目依赖配置
├── hospital.db        # SQLite数据库文件
└── .gitignore         # Git忽略配置
```

## 安装与运行

1. 安装依赖
```bash
npm i
```

2. 运行后端服务
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## API接口说明
非admin接口可以直接调用，admin接口(除登录接口外)需登录后调用

## 默认管理员账户
- 用户名: admin
- 密码: admin123

## 注意事项
- 后端服务默认运行在 http://localhost:3000
- 确保在前端项目中正确配置API基础URL指向后端服务
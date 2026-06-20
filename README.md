# 生物化学题库网站

这是一个可部署到 GitHub Pages 的静态题库网站，支持导入题库 JSON、章节跳转、即时判题、错题复练，以及通过 Supabase 做公网三端同步。

## 本地使用

双击 `start-site.bat`，然后打开：

```text
http://localhost:5173
```

手机和平板在同一 Wi-Fi 下访问启动窗口里的 LAN 地址。

## GitHub Pages 部署

1. 新建一个 GitHub 仓库。
2. 上传本文件夹里的这些文件：
   - `index.html`
   - `styles.css`
   - `app.js`
   - `questions.json`
   - `README.md`
   - `supabase_schema.sql`
3. 在仓库 `Settings -> Pages` 里选择 `Deploy from a branch`。
4. Branch 选择 `main`，目录选择 `/root`，保存。
5. 等 GitHub Pages 构建完成后，打开它给出的公网网址。

`server.js`、`start-site.bat`、`convert_docx_to_json.py` 只用于本地运行和重新生成题库，不需要上传到 GitHub Pages。

## Supabase 公网同步

1. 打开 Supabase，新建项目。
2. 进入 `SQL Editor`。
3. 复制 `supabase_schema.sql` 的内容运行。
4. 进入 `Project Settings -> API`。
5. 复制：
   - `Project URL`
   - `anon public key`
6. 打开题库网站，进入 `设置`。
7. 填入 `Supabase Project URL` 和 `Supabase anon key`，点 `保存配置`。
8. 手机、平板、电脑使用同一个“学习档案”名称，再点 `同步`。

## 注意

当前同步方式不需要登录，适合个人或小范围分享。同一个学习档案名会共用同一份进度，别人如果输入相同档案名也能覆盖这份记录。

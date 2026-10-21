# LoveCan · 爱意罐头

把此刻的心意，封进一只罐子，交给时间。

LoveCan 是一个写给"以后"的信匣。你写下名字、留一段话、录一段声音，选一个日子，然后按下一滴蜡——罐子就封上了。在选定的那一天之前，连你也打不开它。

## 它做什么

- **写信**：给一个名字，写一段话，或者只留一句没说出口的话。
- **留声音**：最长 90 秒的语音，和信一起封进去。
- **选日子**：一天后、一周后、一个月后、半年后、一年后，或者自己挑一个精确到分钟的时刻。
- **封罐**：按住蜡印，等它变凉。蜡一凉，这只罐子就不属于现在了。
- **到期拆封**：日子到了，收件人用你给的链接打开罐子，读到信、听到声音。

腰封上的一句话会按季节自动写好——春天是"等第一场春雨"，秋天是"等落叶铺满台阶"。你也可以自己改。

## 它怎么守密

信和声音在寄出之前就在浏览器里加密，服务端只保存密文。没有钥匙，它也不知道里面写了什么。到期之前，即使寄件人拿着管理链接，也读不到信和声音。

到期之后，收件人可以用专属的钥匙链接打开罐子。打开过一次，罐子会留下"已开封"的印记，但信和声音会一直保留，收件人随时可以回来再读。

如果想收回，寄件人可以用自己的管理链接在到期前撤销——撤销以后，信和声音一起消失，只剩一只空罐子。

## 技术栈

- **前端**：React 19 + TypeScript + Vite 8 + React Router
- **样式**：Tailwind CSS 4 + 自定义纸感主题（宋体 / 楷体 / 手写体）
- **加密**：Web Crypto API（AES-GCM + SHA-256），端到端加密在客户端完成
- **后端**：Qoder Sites Function（Deno），本地开发用 mock 服务
- **部署**：Qoder Sites，静态产物 + Edge Function

## 本地开发

需要 Node 22.x：

```sh
npm ci
npm run dev
```

Vite 会在 `127.0.0.1` 上启动开发服务器。编辑 `src/App.tsx`、`src/globals.css` 和 `index.html` 里的标题与描述。

生产构建：

```sh
npm run build
npm run preview
```

本地 Function（可选，用于端到端测试）：

```sh
npm run dev:function
```

## 部署

项目使用 Qoder Sites 发布。构建产物在 `dist/`，Function 在 `functions/`。

线上地址：https://lovecan-3qpucev7hd9.qoder.zone

## 致谢

字体来自 [Special Elite](https://fonts.google.com/specimen/Special+Elite)（打字机）和 [Caveat](https://fonts.google.com/specimen/Caveat)（手写），许可证见 `public/fonts/`。UI 组件目录基于 Shadcn 适配，许可证见 `vendor/`。

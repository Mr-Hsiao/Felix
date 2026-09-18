# Flutter 做桌面 PMS 的一些实践

从 Electron 切到 Flutter 桌面端一年了，把踩过的坑整理一下。

## 窗口句柄

每个 PMS 客户端有自己专属的窗体类（房务中心、收银台、夜审），用 `bitsdojo_window` 而不是 system window_manager：

```yaml
dependencies:
  bitsdojo_window: ^0.1.6
```

## 键盘焦点

酒店收银员**几乎不用鼠标**，全键盘操作。Flutter 默认的焦点链不直观，要自己包一层：

```dart
class PmsFocusTraversal extends FocusTraversalOrderPolicy {
  // 按业务字段顺序跳转：身份证 → 房号 → 房价 → 押金
}
```

## 输入法位置

中文拼音在屏幕底部浮起时，会挡住 Flutter 的输入框。用 `TextInputAction.search` + 自定义 `TextField` 解决。

## HiDPI

收银机多为 1080P，前台显示器多为 4K。统一用 `MediaQuery.textScalerOf(context)` 而不是写死字体。

## 总结

Flutter 桌面端能解决 80% 的 Electron 痛点，但剩下的 20% 都是细节。建议先做一个简单窗体跑通流程，再考虑迁移。
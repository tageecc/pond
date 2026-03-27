# Badges for README

## 当仓库推送到 GitHub 并设为 public 后，可以添加这些 badges

### 放在标题下方（英文版）

```markdown
[![GitHub Release](https://img.shields.io/github/v/release/tageecc/pond)](https://github.com/tageecc/pond/releases)
[![License](https://img.shields.io/github/license/tageecc/pond)](https://github.com/tageecc/pond/blob/main/LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/tageecc/pond)](https://github.com/tageecc/pond/stargazers)
```

### 可选的其他 badges

```markdown
[![GitHub Issues](https://img.shields.io/github/issues/tageecc/pond)](https://github.com/tageecc/pond/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/tageecc/pond)](https://github.com/tageecc/pond/pulls)
[![GitHub Downloads](https://img.shields.io/github/downloads/tageecc/pond/total)](https://github.com/tageecc/pond/releases)
```

## 刷新 shields.io 缓存

如果 badge 不更新，可以在 URL 后面加 `?cache=bust`：

```markdown
[![GitHub Release](https://img.shields.io/github/v/release/tageecc/pond?cache=bust)](https://github.com/tageecc/pond/releases)
```

或者访问这个 URL 强制刷新：
```
https://img.shields.io/github/v/release/tageecc/pond?cache=flush
```

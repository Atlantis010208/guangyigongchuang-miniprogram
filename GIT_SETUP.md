# Git 远程仓库配置指南

## 当前状态
✅ Git 仓库已初始化
✅ .gitignore 文件已创建
✅ 远程仓库已配置：`https://github.com/Atlantis010208/guangyigongchuang-miniprogram.git`

## 配置远程仓库

### 方法一：添加新的远程仓库

如果你已经有远程仓库地址，使用以下命令：

```bash
# 添加远程仓库（origin 是默认名称，可以自定义）
git remote add origin <你的远程仓库地址>

# 例如：
# git remote add origin https://github.com/username/repo-name.git
# 或
# git remote add origin git@github.com:username/repo-name.git
```

### 方法二：查看和修改远程仓库

```bash
# 查看当前远程仓库
git remote -v

# 修改远程仓库地址
git remote set-url origin <新的远程仓库地址>

# 删除远程仓库
git remote remove origin
```

## 常用 Git 操作

### 首次推送代码到远程仓库

```bash
# 1. 添加所有文件到暂存区
git add .

# 2. 提交代码（如果还没提交）
git commit -m "Initial commit"

# 3. 推送到远程仓库
git push -u origin master
# 或如果主分支是 main
git push -u origin main
```

### 日常使用

```bash
# 查看状态
git status

# 添加文件到暂存区
git add <文件名>
git add .  # 添加所有更改

# 提交更改
git commit -m "提交说明"

# 推送到远程仓库
git push

# 拉取远程更新
git pull

# 查看提交历史
git log

# 查看分支
git branch

# 创建新分支
git checkout -b <分支名>

# 切换分支
git checkout <分支名>
```

### 版本回退

```bash
# 查看提交历史（简化版）
git log --oneline

# 回退到指定提交
git reset --hard <提交ID>

# 回退到上一个提交
git reset --hard HEAD~1

# 回退到远程仓库的版本（如果本地修改有问题）
git reset --hard origin/master

# 查看所有操作历史（包括回退）
git reflog
```

### 撤销更改

```bash
# 撤销工作区的更改（未添加到暂存区）
git checkout -- <文件名>

# 撤销暂存区的更改（已 add 但未 commit）
git reset HEAD <文件名>

# 撤销最后一次提交（保留更改）
git reset --soft HEAD~1

# 撤销最后一次提交（不保留更改）
git reset --hard HEAD~1
```

## 注意事项

1. **首次推送前**：确保已经配置了 Git 用户信息
   ```bash
   git config --global user.name "你的名字"
   git config --global user.email "你的邮箱"
   ```

2. **分支名称**：新版本的 Git 默认分支可能是 `main` 而不是 `master`，根据实际情况调整命令

3. **敏感信息**：确保 `.gitignore` 文件已正确配置，避免提交敏感信息（如 API 密钥、密码等）

4. **定期提交**：建议经常提交代码，每次提交包含一个完整的功能或修复

5. **提交信息**：使用清晰的提交信息，方便后续查看和回退


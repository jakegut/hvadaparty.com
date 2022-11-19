---
title: Export Git Stash to TAR
slug: stash-tar
datetime: 2022-06-06T16:13:06.242Z
draft: true
tags:
  - git
ogImage: ""
---
```sh
git stash list | \
cut -d ":" -f 1 | \
xargs -I {} sh -c "git stash show {} -p > {}.patch; tar cfvz patches.tar {}.patch; rm {}.patch"
```

This will do blah blah blah

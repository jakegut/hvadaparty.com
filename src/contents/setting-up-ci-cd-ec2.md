---
title: Setting up automatic deployments on EC2
slug: github-ec2-ci-cd
datetime: 2023-12-25T16:13:06.242Z
draft: true
tags:
  - ci-cd
ogImage: ""
---

We all host servers on EC2. Because its easier and good for debugging in DEV environments, so as usual we also mostly use EC2 for Dev Servers and ECS or EKS for prod for the scalability and benfits of containerization.

So the problem we are discussing today is how to restart the server with latest changes of the code in EC2 once a GIT Branch is Updated.


So there are multiple ways for doing this,
the most preffered ones were,
1. Github Actions
2. Github Webhooks

so Github Actions helps us to Automate, customize, and execute workflows right in our repositories,these will be triggered and can be customised on branch basis and action basis, basically it makes CI-CD so easy that its just like 20 lines of YAML away for 0 click setup(okay, you need to push changes so, One Click ahead)


## Github Actions
So all we need to do is, just go to the Actions tab > click on "New Workflow" > "Setup new workflow by yourself" > Create "deploy-ec2-dev.yml", thats all. a new file will be created on .github/workflows folder

./github/workflows/deploy-ec2-dev
```YAML
name: Deploy and Restart Server on EC2

on:
  push:
    branches:
      - dev

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout code
      uses: actions/checkout@v2

    - name: SSH and Deploy
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.SERVER_HOST }}
        username: "ubuntu"
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        script: |
          echo "Setting up Git for pull operation"
          cd /home/ubuntu/websocket-server/src
          pwd
          git config --global credential.helper store
          git remote set-url origin https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/LayerE/websocket-server.git
          
          echo "Pulling latest changes from the repository"
          git pull
          which /home/ubuntu/.nvm/versions/node/v16.20.2/bin/pm2
          source ~/.bashrc
          which /home/ubuntu/.nvm/versions/node/v16.20.2/bin/pm2
          echo "Restarting the server using pm2"
          /home/ubuntu/.nvm/versions/node/v16.20.2/bin/pm2 restart websocket-server


```
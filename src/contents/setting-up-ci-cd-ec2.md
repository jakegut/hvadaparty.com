---
title: Setting up automatic deployments on EC2 and Lambdas
slug: setting-up-ci-cd-ec2
datetime: 2023-12-25T16:13:06.242Z
draft: true
tags:
  - ci-cd
ogImage: ""
---

We all host servers on EC2. Because its easier and good for debugging in DEV environments, so as usual we also mostly use EC2 for Dev Servers and ECS or EKS for prod for the scalability and benfits of containerization.

So the problem we are discussing today is how to restart the server with latest changes of the code in EC2 once a GIT Branch is Updated.

We also have few lambdas and serverless apps written by serverless wrapper (sls) for ingestions and functions, so we want them to be deployed once a commit is made or the watch folders gets updated


So there are multiple ways for doing this,
the most preffered ones were,
1. Github Actions
2. Github Webhooks

so Github Actions helps us to Automate, customize, and execute workflows right in our repositories,these will be triggered and can be customised on branch basis and action basis, basically it makes CI-CD so easy that its just like 20 lines of YAML away for 0 click setup(okay, you need to push changes so, One Click ahead)


# Github Actions

## EC2 Auto Deployment
So all we need to do is, just go to the Actions tab > click on "New Workflow" > "Setup new workflow by yourself" > Create "deploy-ec2-dev.yml", thats all. a new file will be created on .github/workflows folder

Also Remember this expects that, you already sshed to the instance, installed pm2 and then even setup the server already, as this config file will only do a git pull and restart the deployment

Before adding the Workflow file, we need to setup few secrets on Github Secrets, you need admin access for this (needs to be done on settings tab of repository)
   1. SERVER_HOST
   2. SSH_PRIVATE_KEY


./github/workflows/deploy-ec2-dev.yml
```yaml
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

## Lambdas Auto Deployment
So all we need to do is, just go to the Actions tab > click on "New Workflow" > "Setup new workflow by yourself" > Create "deploy-serverless-stack-dev.yml", thats all. a new file will be created on .github/workflows folder


Before adding the Workflow file, we need to setup few secrets on Github Secrets, you need admin access for this (needs to be done on settings tab of repository)
   1. AWS_ACCESS_KEY_ID
   2. AWS_SECRET_ACCESS_KEY
   3. AWS_REGION

./github/workflows/deploy-serverless-stack-dev.yml
```yaml
name: Deploy to AWS

on:
  push:
    branches:
      - dev
    paths:
      - 'aws/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v2

      - name: Set up Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install Serverless Framework
        run: npm install -g serverless

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION}}

      - name: Deploy
        run: |
          cd aws
          sls deploy --stage dev
```
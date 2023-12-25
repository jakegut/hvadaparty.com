---
title: Setting up automatic deployments on EC2, Lambdas, EKS, ECS
slug: setting-up-ci-cd-ec2
datetime: 2023-12-25T16:13:06.242Z
draft: false
tags:
  - ci-cd
  - aws
ogImage: ""
---

Setting up CI-CD is first thing to do post initial development,some times even before that, It will reduce all the headache of re-running same commands each time.

We all host servers on EC2. Because its easier and good for debugging in DEV environments, so as usual we also mostly use EC2 for Dev Servers and ECS or EKS for prod for the scalability and benfits of containerization.

So the problem we are discussing today is how to restart the server with latest changes of the code in EC2 once a GIT Branch is Updated.

We also have few lambdas and serverless apps written by serverless wrapper (sls) for ingestions and functions, so we want them to be deployed once a commit is made or the watch folders gets updated

Most of the Prod Code will be running under EKS (if it is configured for Kubernetes Plane) else it will be running on ECS (Dockerized EC2 runtime or Fargate Runtime)


So here we will be discussing all the approaches on solving all the CI-CD automations with github that uses these environments


So there are multiple ways for doing this,
the most preffered ones were,
1. Github Actions
2. Github Webhooks

so Github Actions helps us to Automate, customize, and execute workflows right in our repositories,these will be triggered and can be customised on branch basis and action basis, basically it makes CI-CD so easy that its just like 20 lines of YAML away for 0 click setup(okay, you need to push changes so, One Click ahead)

## Insight on what to use
+ EC2 - use it if you need OS level access of things
+ EKS - use it for containerized apps with kubernetes orchestrations
+ ECS with EC2 - use it for containerized apps to be run on servers (auto managed by ECS)
+ ECS with Fargate - everything same as ECS with EC2 except this is serverless
+ Lambda - Serverless, easy to intergeate with other services, like API gateway, event bridge, SQS and all

So, i'll simply conclude see,
+ If you need *scalability* use Lambda(Straight forward) or EKS
+ If you need *serverless* use Fargate or Lambda (according to need)
+ EC2 has most control after that it is ECS, EKS.
+ Lambda is cost efficient for Normal Workloads, but costlier on high workloads, also has concurrency limit
+ EC2,EKS,ECS are efficeient in consistent workloads


# Github Actions

## Setting up Secrets First

Before adding the Workflow file, we need to setup few secrets on Github Secrets, you need admin access for this (needs to be done on settings tab of repository)

This secrets will be helping us to reuse the keys and also wont be exposed to the users or in the workflow file

You can add it under Repository Settings > Secrets > Add new secret

## EC2 Auto Deployment (SSH to server and PM2)
So all we need to do is, just go to the Actions tab > click on "New Workflow" > "Setup new workflow by yourself" > Create "deploy-ec2-dev.yml", thats all. a new file will be created on .github/workflows folder

Also Remember this expects that, you already sshed to the instance, installed pm2 and then even setup the server already, as this config file will only do a git pull and restart the deployment

We need to add these to the secrets
   1. SERVER_HOST
   2. SSH_PRIVATE_KEY


./github/workflows/deploy-ec2-dev-pm2.yml
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



## EC2 Deployment (without existing process runner)

 Secrets to be added
   1. AWS_ACCESS_KEY_ID
   2. AWS_SECRET_ACCESS_KEY
   3. AWS_REGION

./github/workflows/deploy-ec2-dev.yml
```yaml
name: EC2 Deployment

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repository
      uses: actions/checkout@v2

    - name: Set up AWS credentials
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ secrets.AWS_REGION }}

    - name: Build and Push Docker Image
      run: |
        echo ${{ secrets.AWS_SECRET_ACCESS_KEY }} | docker login -u AWS --password-stdin https://${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com
        docker build -t ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/your-repo-name:${{ github.sha }} .
        docker push ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/your-repo-name:${{ github.sha }}

    - name: Deploy to EC2
      run: |
        aws ec2 run-instances \
          --image-id ami-xxxxxxxxxxxxxxxxx \
          --instance-type t2.micro \
          --key-name your-key-pair \
          --subnet-id your-subnet-id \
          --security-group-ids your-security-group-id \
          --region ${{ secrets.AWS_REGION }}

```



## Lambdas Auto Deployment
So all we need to do is, just go to the Actions tab > click on "New Workflow" > "Setup new workflow by yourself" > Create "deploy-serverless-stack-dev.yml", thats all. a new file will be created on .github/workflows folder


Add these secrets in github secrets, so that we can acces them in workflow file
   1. AWS_ACCESS_KEY_ID
   2. AWS_SECRET_ACCESS_KEY
   3. AWS_REGION

Watch folder is added for 'aws/**' that means if any files changed under this will trigger the rebuild

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


## EKS Auto Deployment
So all we need to do is, just go to the Actions tab > click on "New Workflow" > "Setup new workflow by yourself" > Create "deploy-eks-prod.yml", thats all. a new file will be created on .github/workflows folder


We need the AWS access and registry url to be accessible in workflow, so add these to secret
   1. AWS_ACCESS_KEY_ID
   2. AWS_SECRET_ACCESS_KEY
   3. AWS_REGION
   4. AWS_REGISTRY_URL


./github/workflows/deploy-eks-prod.yml

```yaml
name: EKS Deployment

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repository
      uses: actions/checkout@v2

    - name: Set up AWS credentials
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ secrets.AWS_REGION }}

    - name: Install kubectl
      run: |
        sudo apt-get update
        sudo apt-get install -y kubectl

    - name: Configure kubectl
      run: aws eks --region ${{ secrets.AWS_REGION }} update-kubeconfig --name websocket-server

    - name: Apply Kubernetes manifests
      run: kubectl apply -f kubernetes-manifests/

    - name: Deploy to EKS
      run: kubectl set image deployment/websocket-server websocket-container=${{ secrets.AWS_REGISTRY_URL }}/websocket-server:${{ github.sha }}
```

## ECS Auto Deployment
### ECS (EC2 Launch Type) Deployment

```yaml
name: ECS (EC2) Deployment

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repository
      uses: actions/checkout@v2

    - name: Set up AWS credentials
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ secrets.AWS_REGION }}

    - name: Build and Push Docker Image
      run: |
        echo ${{ secrets.AWS_SECRET_ACCESS_KEY }} | docker login -u AWS --password-stdin https://${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com
        docker build -t ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/websocket-server:${{ github.sha }} .
        docker push ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/websocket-server:${{ github.sha }}

    - name: Update ECS Service
      run: |
        aws ecs update-service \
          --cluster websocket-cluster \
          --service websocket-service \
          --region ${{ secrets.AWS_REGION }} \
          --force-new-deployment
```



### ECS (Fargate) Deployment
```yaml
name: ECS (Fargate) Deployment

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repository
      uses: actions/checkout@v2

    - name: Set up AWS credentials
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ secrets.AWS_REGION }}

    - name: Build and Push Docker Image
      run: |
        echo ${{ secrets.AWS_SECRET_ACCESS_KEY }} | docker login -u AWS --password-stdin https://${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com
        docker build -t ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/websocket-server:${{ github.sha }} .
        docker push ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/websocket-server:${{ github.sha }}

    - name: Create or Update ECS Task Definition
      run: |
        aws ecs register-task-definition \
          --family websocket-server-task-family \
          --container-definitions "$(cat path/to/your/container-definition.json)" \
          --region ${{ secrets.AWS_REGION }}

    - name: Update ECS Service
      run: |
        aws ecs update-service \
          --cluster websocket-server-ecs-cluster \
          --service websocket-server-ecs-service \
          --region ${{ secrets.AWS_REGION }} \
          --force-new-deployment

```
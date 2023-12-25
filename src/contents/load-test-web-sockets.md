---
title: Load Testing Web Sockets
slug: loadtest-ws
datetime: 2023-12-11T16:13:06.242Z
draft: true
tags:
  - testing
ogImage: ""
---

Websockets are a essential part of the trading and betting apps that show live data. These are the cruical part that we need to think about when we are going to a scale, Lets consider if our app has around 100k+ users that places bets and atleast 10K+ users that views the data at a point of time, that scales to 10K+ active connections the socket needs to handle and fetch the data.

This is where the things starts to fall apart, This is the part where we will remember the text book definitions of caching and expensive nature of db calls.

If you are thinking about a scale of that many users, even small things will make big differences,

one of such case is

when a user requested data and you went fetching for the data, then user refreshed the page and made a new connection again, so now you are already fetching data and now he requested that again.

So i was writing few websockets for showing live data of trades and events of users and i was supposed to load test them to make sure they work for scale

## Initial Implementation on the websockets

### Tech Stack

I wanted to keep the websockets as clean as possible without any packages just plain ws by node js

### Which scale to go on infra side Horizantal vs Vertical

I first kept everything under a single ec2 which i thought would be fine, for dev i kept it under t2 micro, when going through QA, moved that to c5.xl instance.

Everything went fine, until one load test broke the instance, everything collapsed, why? i was launching puppeter instances for scraping live odds and that took a hit on cpu, at max cpu went to 80% and machine went to unreachable state.

One more issue is storage of EC2, puppeteer stores a instance cache that builds up to a certain level if not deleted frequently, which will eats up your storage, this happend and a instance of 20GB with no other server running apart from this has been filled up in a 15 days of basic testing with frequent load test (dev stage).

[![Screenshot-2023-12-10-at-12-46-51-AM.png](https://i.postimg.cc/D088fgmV/Screenshot-2023-12-10-at-12-46-51-AM.png)](https://postimg.cc/rR28Q5Sg)
If you see this there are around 300K+ chrome profiles created that i found hard time to find, what took up that much storage until i get to these

so, if you want to check whats taking up more space in your EC2 (ubuntu one), try running this
```bash
for i in G M K; do    du -ah | grep [0-9]$i | sort -nr -k 1; done | head -n 11
```

Then i learnt my lesson and moved everything to eks,kept log rotation under services running in ec2(this is a big memory saver), seperated scraper service and other live apis that need websockets, kept dyanmo as a intermediate (scraper scrapes and store data in dynamo, the live data for odds will be fetched from dynamo). So the thing is we need to avoid single point of failures. So Horizantal scaling ftw!!

### So you say horizantal scaling... its not easy as we say

Horizantal scaling is a scale out technique, where we cann have multiple instances connected by a mediator (Load Balancer) that routes the requests to them, so if one instance fails, it wont take everything down. But here is the issue, the load balancer should route properly ensuring no server is overworked

Load balancers detect the health of backend resources. If a server goes down, the load balancer redirects its traffic to the remaining operational servers. The load balancer automatically starts distributing traffic whenever we add a new WebSocket server.

### Which load balance you have choosen

There are a lot load balancing techniques both static and dynamic which help serving the requests [(https://ably.com/topic/the-challenge-of-scaling-websockets#load-balancing-algorithms)], but i need something that loads faster and has less active connections, so its simple and straight forward but one more desicion that we took is sticky sessions.i have read a article, that sticky sessions can help web sockets to share the connection state, so it can ensure stream continuity without needing a connection to the same server. I used redis as a intermediate to put and pull data from regarding the states and filters the user asked.

### Everythings looking green, but what if your socket fails, will user wait?

Yes, Some users have issue to get data from websockets, say firewall or smth or even some browsers they mentioned the connections are dropping, so we in the server stores information regarding when the user connected and if the connection is terminated automatically so when this arises continously then we will shift the user to HTTP Long Polling

## Part 1: Dipping Our Toes - Basic WebSocket Testing

Starting with WebSocket testing felt like stepping into a new world. The primary goal? Establish a stable connection.

### Basic Connection Test

I started with `k6` for its simplicity. Here's a basic test script:

```javascript
import ws from "k6/ws";
import { check } from "k6";

export default function () {
  const url = "wss://example.com/websocket";
  const response = ws.connect(url, {}, function (socket) {
    socket.on("open", function open() {
      console.log("Connection established");
    });

    socket.on("close", function close() {
      console.log("Connection closed");
    });
  });

  check(response, { "status is 101": r => r && r.status === 101 });
}
```

Running this script in my terminal gave me the following output:

```
INFO[0001] Connection established
INFO[0005] Connection closed
```

## Part 2: Adding Substance with Payloads

Sending payloads through WebSockets is like whispering secrets. It's crucial to ensure these messages are delivered correctly.

Sending a JSON Payload
I modified my k6 script to send a JSON message:

```javascript
socket.on("open", function open() {
  console.log("Connected");
  socket.send(JSON.stringify({ message: "Hello from the other side!" }));
});
```

When I ran this, the server responded, confirming receipt:

```
INFO[0001] Connected
INFO[0001] Received message: {"status":"Message received!"}
```

## Part 3: The Art of Secrecy - WebSocket Authentication

Testing WebSockets with authentication adds a layer of intrigue. It's like needing a secret handshake to start a conversation.

Implementing Token-Based Authentication
In k6, I added an Authorization header for the WebSocket connection:

```javascript
const response = ws.connect(
  url,
  { headers: { Authorization: "Bearer YourAuthToken" } },
  function (socket) {
    // Connection logic
  }
);
```

This setup successfully established an authenticated connection:

```
INFO[0001] Authenticated WebSocket connection established
```

k6 shines when it comes to simulating complex, real-world user scenarios. Here’s how I used it for comprehensive WebSocket testing.

### Simulating Ramp-Up and Ramp-Down

Ramping up and down is crucial to understand how the system behaves under gradually increasing and decreasing load. Here’s how I set it up:

```javascript
import ws from "k6/ws";
import { check, sleep } from "k6";

export let options = {
  stages: [
    { duration: "2m", target: 100 }, // Ramp-up to 100 users over 2 minutes
    { duration: "5m", target: 100 }, // Stay at 100 users for 5 minutes
    { duration: "2m", target: 0 }, // Ramp-down to 0 users over 2 minutes
  ],
};

export default function () {
  const url = "wss://example.com/websocket";
  const response = ws.connect(url, {}, function (socket) {
    socket.on("open", function open() {
      console.log("Connected");
      socket.send("Hello, WebSocket!");
      sleep(1); // Simulate time taken by a user action
    });

    socket.on("message", function message(data) {
      console.log(`Received message: ${data}`);
    });

    socket.on("close", function close() {
      console.log("Disconnected");
    });
  });

  check(response, { "Connected successfully": r => r && r.status === 101 });
}
```

This script simulates users connecting to the WebSocket, sending a message, and then disconnecting, with the number of users gradually increasing and decreasing.

## Stress Testing

Stress testing helps identify the breaking point of the system. I configured k6 to gradually increase the load until the system started to show signs of strain:

```javascript
export let options = {
  stages: [
    { duration: "1m", target: 200 }, // Ramp-up to 200 users in 1 minute
    { duration: "3m", target: 200 }, // Stay at 200 users for 3 minutes
    { duration: "1m", target: 400 }, // Increase to 400 users over 1 minute
    { duration: "2m", target: 400 }, // Stay at 400 users for 2 minutes
    { duration: "1m", target: 0 }, // Ramp-down to 0 users
  ],
};
```

## Real-Time Scenarios

Simulating real-time user interactions involved sending varied messages and receiving responses:

```javascript
socket.on("open", function open() {
  socket.send("Initial Message");
  sleep(1);

  for (let i = 0; i < 5; i++) {
    socket.send(`Message ${i}`);
    sleep(1);
  }
});
```

## Monitoring and Metrics

k6 provides various metrics and monitoring capabilities. I used them to monitor response times, error rates, and the number of open connections.

```
✓ status is 101

     checks................: 100.00% ✓ 693       ✗ 0
     data_received.........: 4.7 MB  14 kB/s
     data_sent.............: 488 kB  1.5 kB/s
     iteration_duration....: avg=35.03s min=396.31ms med=19.93s max=2m58s p(90)=2m0s  p(95)=2m21s
     iterations............: 693     2.099984/s
     vus...................: 1       min=1       max=100
     vus_max...............: 100     min=100     max=100
     ws_connecting.........: avg=1.1s   min=366.69ms med=1.44s  max=3.86s p(90)=1.52s p(95)=1.72s
     ws_msgs_received......: 5065    15.348371/s
     ws_session_duration...: avg=35.03s min=396.25ms med=19.93s max=2m58s p(90)=2m0s  p(95)=2m21s
     ws_sessions...........: 732     2.218165/s


running (5m30.0s), 000/100 VUs, 693 complete and 39 interrupted iterations
default ✓ [======================================] 001/100 VUs  5m0s
```

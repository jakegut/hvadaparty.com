---
title: Learning Rust through a Ray Tracer
slug: rs-rt
datetime: 2023-07-07T16:13:06.242Z
draft: false
tags:
  - rust
  - raytracer
  - learning
ogImage: ""
---

![null](/images/cornell-box_stanford-dragon.png)

Learning Rust by writing a ray tracer isn't exactly a [novel](https://blog.singleton.io/posts/2022-01-02-raytracing-with-rust/) [idea](https://github.com/search?q=rust+raytracer), but it's a great learning experience. From rendering a solid-color "sphere" to an entire scene with various materials, you get hits of dopamine all the way through. This isn't my first time writing a ray tracer, I've written one in [Java](https://github.com/jakegut/raytracer) and another, unpublished one in C++. All of these were based on Pete Shirley's [_Ray Tracing in One Weekend Series_](https://raytracing.github.io/) (RTOW). If you're not familiar with the series, it teaches how to write a ray tracer with working C++ code examples from sphere intersections to a Monte-Carlo path tracer.

Writing a ray tracer is a great way to learn a new programming language, especially after you've written one in a familiar language. You're able to learn how a language may approach things like polymorphism, interfaces, pointers, memory management, and more. And with a ray tracer, the sky's the limit with the number of features that you can add such as multi-threading, GUIs, GPU support through CUDA, and even ray tracing on multiple machines. While I was learning about Rust's smart pointers, traits, etc., I also learned what makes Rust a great language when it comes to large code bases which I'll highlight by comparing RTOW's C++ code and my Rust translation.

## What the Rust

While Rust has a well-deserved reputation for a high learning curve, the compiler has great suggestions on what you can do to fix your code. Sometimes the compiler can be a bit cryptic, and you can even use a different solution such as avoiding explicit lifetimes when it calls for one. Rust's strict borrow checker and lifetimes are what make the language a great one. You know when variables will be used and how will be used or modified, and when they'll be dropped (freed from memory). For instance, let's take this C++ snippet from RTOW:

```cpp
bool sphere::hit(
    const ray& r,
    double t_min,
    double t_max,
    hit_record& rec) const {
    vec3 oc = r.origin() - center;
    auto a = r.direction().length_squared();
    auto half_b = dot(oc, r.direction());
    auto c = oc.length_squared() - radius*radius;

    auto discriminant = half_b*half_b - a*c;
    if (discriminant < 0) return false;
    auto sqrtd = sqrt(discriminant);

    // Find the nearest root that lies in the acceptable range.
    auto root = (-half_b - sqrtd) / a;
    if (root < t_min || t_max < root) {
        root = (-half_b + sqrtd) / a;
        if (root < t_min || t_max < root)
            return false;
    }

    rec.t = root;
    rec.p = r.at(rec.t);
    rec.normal = (rec.p - center) / radius;

    return true;
}
```

This function is responsible for determining if the given ray and `t_min`/`t_max` interval intersects with a sphere. For the last few lines of code, we mutate the `rec` variable with information about the hit if there's one and `return true` since we've made a hit. The `rec` information was then used in other `hit(...)`s and modified if there was an intersection and so on. When first reading the code, I couldn't entirely understand the use of the `rec` variable and across the multiple `hit(...)` calls. The lack of a `const` keyword should've hinted that it was mutable, but this doesn't guarantee that it will be mutated in the function. Let's look at a 1-to-1 Rust translation:

```rust
fn hit(&self, r: &Ray, t_min: f64, t_max: f64, rec: &HitRecord) -> bool {
    // sphere intersection logic

    rec.t = root;
    rec.p = r.at(rec.t);
    rec.normal = (rec.p - center) / radius;

    true
}
```

However, this doesn't compile and gives us this error and suggestion:

```plaintext
error[E0594]: cannot assign to `rec.t`, which is behind a `&` reference
  --> src/sphere.rs:56:9
   |
56 |         rec.t = root;
   |         ^^^^^^^^^^^^ `rec` is a `&` reference, so the data it refers to cannot be written
   |
help: consider changing this to be a mutable reference
   |
36 |     fn hit(&self, r: &Ray, t_min: f64, t_max: f64, rec: &mut HitRecord) -> bool {
```

This lets us know that we can change the `&HitRecord` to `&mut HitRecord` instead, which lets us mutate the reference to a `HitRecord`. The fact that there's a `&mut` for us to use in Rust lets the reader know that the variable will be mutated in the function, which wasn't as clear with the C++ example.

I still wasn't a huge fan of using a `&mut` and I know there's something else that we can use to combine the bool return value with information: `Option<...>`. An `Option` is part of the standard library and is just an enum with two states: `None` with no value and `Some(...)` with an associated value. We can refactor our `hit(...)` function to return an `Option<HitRecord>` instead, which personally makes more sense to me instead of mutating a variable and then returning a bool if we mutated it or not:

```rust
fn hit(&self, r: &Ray, t_min: f64, t_max: f64) -> Option<HitRecord> {
    let oc = r.orig - self.center;
    let a = r.dir.length_squared();
    let half_b = oc.dot(r.dir);
    let c = oc.length_squared() - self.radius * self.radius;

    let disc = half_b * half_b - a * c;
    if disc < 0.0 {
        return None;
    }
    let sqrtd = disc.sqrt();

    let mut root = (-half_b - sqrtd) / a;
    if root < t_min || t_max < root {
        root = (-half_b + sqrtd) / a;
        if root < t_min || t_max < root {
            return None;
        }
    }

    let mut rec = HitRecord::default();
    rec.t = root;
    rec.p = r.at(rec.t);
    rec.normal = (rec.p - self.center) / self.radius;

    Some(rec)
}
```

Instead of returning `false` we return `None`, and `true` we return `Some(rec)` which is a populated `HitRecord`. Let's demonstrate how we can use the `Option` by having a `HittableList`, which is responsible for holding multiple `Hittable`s, such as multiple `Sphere`s, and getting the closest hit based on that list. Here's how RTOW approached it:

```cpp
bool hittable_list::hit(
        const ray& r,
        double t_min,
        double t_max,
        hit_record& rec)
    const {
    hit_record temp_rec;
    bool hit_anything = false;
    auto closest_so_far = t_max;

    for (const auto& object : objects) {
        if (object->hit(r, t_min, closest_so_far, temp_rec)) {
            hit_anything = true;
            closest_so_far = temp_rec.t;
            rec = temp_rec;
        }
    }

    return hit_anything;
}
```

Within our loop of objects, we call our familiar `hit(...)` function and take the mutated `temp_rec`, assign it to our outer `rec` and record some information such as the new `t_max`, and `hit_anything`. By having the `hit(...)` return a bool, we can have nice looking code like this. In the Rust version of our `Option<HitRecord>`, we can use the `match` expression which lets us pattern-match an expression to be used in a block:

```rust
fn hit(&self, r: &Ray, t_min: f64, t_max: f64) -> Option<HitRecord> {
    if self.objects.len() == 0 {
        return None;
    }

    let mut rec = None;
    let mut closest_so_far = t_max;

    for object in self.objects.iter() {
        match object.hit(r, t_min, closest_so_far) {
            Some(hit) => {
                closest_so_far = hit.t;
                rec = Some(hit)
            }
            None => continue,
        }
    }

    rec
}
```

While we still return an `Option`, we can still have clean code with the `match` expression. We decompose the `Some(hit)`, which lets us use the `hit: HitRecord` variable within the scope of that block. With `match` we have to check for each possible value, which is we have the no-op `None => continue`. A `match` isn't the only way to do this, since the `None` is a no-op we can operate only on the `Some(...)` like so:

```rust
fn hit(&self, r: &Ray, t_min: f64, t_max: f64) -> Option<HitRecord> {
    // ...

    for object in self.objects.iter() {
        if let Some(hit) = object.hit(r, t_min, closest_so_far) {
            closest_so_far = hit.t;
            rec = Some(hit);
        }
    }

    rec
}
```

The `if let` lets us assign a variable and pattern to match the value within the `Option`, producing nearly identical code to its C++ counterpart with the addition of readability.

With the translation, we can still produce great Rust code that, in my opinion, is more readable than its C++ counterpart. Using `&mut`, or even an `Option` instead, lets the reader -- either a future you, a new hire, etc. -- know what the intended use of the variable is. `&mut` isn't the only identifier that can do this, Rust's multiple smart pointers do this as well.

## Multi-threading Woes

Rust's strict borrow checker and lifetimes aren't without it's headaches. When adding multi-threading to this ray tracer, I sunk in a lot of time trying to determine a way to send data around to multiple threads that makes the compiler (and me) happy. My first attempt was using [Rayon's](https://github.com/rayon-rs/rayon) `par_iter()` and `map(...)` so that each row in the image would be rendered in parallel. However, I used a lot of `Arc<...>`s. I had `Arc`s for my world data, frame image to be rendered in the GUI and some configuration. In Rust, `Arc` is a container that wraps the underlying value in an atomic reference counter. There's the non-atomic counter-part `Rc<...>` which isn't thread-safe. Whenever you `clone()` an `Arc` or `Rc` increments the reference counter rather than cloning an entire value. When it gets dropped -- when the value's lifetime ends such as when a function returns -- it decrements the counter. The `par_iter().map(...)` wasn't able to clone those `Arc`s properly.

To handle those `Arc.clone()`s, I opted to manually create threads. Right before, I would clone them and they would be used in the thread like normal. When creating a thread, the function looks something like this: `thread::spawn(|| {})`, the `|| {}` is a closure. To use other variables in a closure, you must specify `move` when writing the closure: `move || {}`, so that the closure will take ownership of anything outside of the scope of the closure, those moved values will be dropped when the closure ends. So calling threads would look something like this:

```rust
for j in 0..IMAGE_HEIGHT {
    let world: Arc<Object> = world.clone()
    thread::spawn(move || {
        for i in 0..IMAGE_WIDTH {
            // use `world` somewhere in here
        }
    })
}
```

However, Rust still wasn't happy. It couldn't tell when the threads would end and wouldn't allow the use of the `world` since the lifetime would end after the function would return, but the thread could continue.

```rust
let pool = ThreadPoolBuilder::new().num_threads(12).build().unwrap();

pool.scope(|s| {
    for j in 0..IMAGE_HEIGHT {
        let world: Arc<Object> = world.clone()
        s.spawn(move || {
            for i in 0..IMAGE_WIDTH {
                // use `world` in some function
            }
        })
    }
})
```

I also used a thread pool to limit the number of threads I was running, all thanks to Rayon. With the use of smart pointers, I was able to tell how my variables will be used. For instance, `Arc` tells me that I will be referencing a value multiple times across threads. Mutating a shared, referenced variable is a different story.

Entering mutexes, our favorite way of ensuring race conditions, is of course available in Rust but the way it's implemented had my head scratching for a bit. I had to use mutexes to manipulate the in-progress image to be displayed in the GUI. Let's say we have an `Image` with a `put_color(&mut self, x, y, Color)` function. The `&mut self` is a reference to the instance of the `Image`, but with a mutable reference so we can change the underlying image. So using our handy `Arc` to pass it around our new code looks something like this.

```rust
pool.scope(|s| {
    for j in 0..IMAGE_HEIGHT {
        let world: Arc<Object> = world.clone()
        let image: Arc<Image> = image.clone()
        s.spawn(move || {
            for i in 0..IMAGE_WIDTH {
                // use `world` in some function
                let color = ray_color(i, j, world)
                image.put_color(i, j, color)
            }
        })
    }
})
```

While this looks like somewhat reasonable code, it won't be able to compile because we need a mutable reference to `Image`, which `Arc` can't provide since it doesn't implement the `DerefMut` trait. So let's add that `Mutex` around the image:

```rust
pool.scope(|s| {
    for j in 0..IMAGE_HEIGHT {
        let world: Arc<Object> = world.clone()
        let image: Arc<Mutex<Image>> = image.clone()
        s.spawn(move || {
            for i in 0..IMAGE_WIDTH {
                let color = ray_color(i, j, world)
                image.put_color(i, j, color)
            }
        })
    }
})
```

We wrap the `Mutex` with an `Arc` so that we can clone the underlying `Mutex`. However, this code still won't compile since the `image` used within the spawn is just a `Mutex` and we still don't have access to the image. To use the `image` we need to acquire a lock on the `Mutex`.

```rust
pool.scope(|s| {
    for j in 0..IMAGE_HEIGHT {
        let world: Arc<Object> = world.clone()
        let image: Arc<Mutex<Image>> = image.clone()
        s.spawn(move || {
            for i in 0..IMAGE_WIDTH {
                let mut img = image.lock().unwrap(); // should actually handle this error
                let color = ray_color(i, j, world)
                img.put_color(i, j, color)
            }
        })
    }
})
```

Once we have the lock, we need to release it so that other threads can mutate the `image`. This is taken care of due to the `img` variable being a `MutexGuard` and implementing the `Drop` trait. When a `MutexGaurd` is dropped, and it releases the lock. I didn't realize this at first, especially coming from a language like Go where you have to explicitly release the lock. To release the lock manually, all you have to do is `drop(...)` on the `MutexGuard`.

## Tips for Learning Rust

From this experience, I have some advice for those new to Rust.

1. Don't worry about writing "idiomatic" Rust; you'll pick up on different, better ways of writing Rust as you learn
2. Don't worry about using too many `clone()` s or `copy()`s; when working with Rust's borrow checker, just find the easiest way to resolve the issues.
3. Read Rust code; I found this to be one of the best ways to learn Rust

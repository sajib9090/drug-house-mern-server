const express = require("express");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 5000;
const moment = require("moment-timezone");
const jwt = require("jsonwebtoken");

require("dotenv").config();
app.use(express.static("dist"));

//MIDDLE WARE
const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

// mongoDB

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// middleware function for jwt
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  // console.log(authorization);
  if (!authorization) {
    return res.status(401).send({ error: "Unauthorized Access" });
  }

  //step-2
  const token = authorization.split(" ")[1];
  // console.log(token);
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const usersCollection = client.db("shikderDB").collection("users");
    const productsCollection = client.db("shikderDB").collection("products");
    const countryCollection = client.db("shikderDB").collection("country");
    const genericCollection = client.db("shikderDB").collection("generic");
    const cartCollection = client.db("shikderDB").collection("carts");
    const manufacturerCollection = client
      .db("shikderDB")
      .collection("manufacturer");
    const dosageFormCollection = client
      .db("shikderDB")
      .collection("dosageForm");

    //---------------------------------------------
    // post api for jwt
    app.post("/api/jwt", async (req, res) => {
      const body = req.body;

      const token = jwt.sign(body, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res.send({ token });
    });
    // post, patch and get api for generic
    app.get("/api/get/generic/:text", async (req, res) => {
      const result = await genericCollection
        .find(
          {
            generic: { $regex: req.params.text },
            status: "approved",
          },
          {
            projection: { generic: 1 },
          }
        )
        .toArray();
      res.send(result);
    });

    // older first api
    app.get("/api/all/users", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const perPage = 30;
      const skip = (page - 1) * perPage;

      try {
        const totalCount = await usersCollection.countDocuments();
        const result = await usersCollection
          .find()
          .sort({ createdAt: 1 })
          .skip(skip)
          .limit(perPage)
          .toArray();

        const totalPages = Math.ceil(totalCount / perPage);

        res.send({
          currentPage: page,
          totalPages: totalPages,
          perPage: perPage,
          totalUsers: totalCount,
          users: result,
        });
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send("Error fetching users");
      }
    });

    //users get by id
    app.get("/api/userGetById/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const query = { _id: new ObjectId(id) };
      const data = await usersCollection.findOne(query);
      res.send(data);
    });
    // users get by email
    //for normal fetch by email

    // for editing
    app.get("/api/users/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== req.params.email) {
        return res.status(403).send({ error: "Forbidden Access" });
      }
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // post api

    app.post("/api/add/users", async (req, res) => {
      const user = req.body;
      const userTimezone = "Asia/Dhaka";

      user.createdAt = moment().tz(userTimezone).toDate();
      user.role_createdAt = moment().tz(userTimezone).toDate();
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exist" });
      }

      // Set default values for user role customer
      user.role = "customer";

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // product related api
    // get api for product
    app.get("/api/product/:id", async (req, res) => {
      const productId = req.params.id;
      try {
        const product = await productsCollection.findOne({
          _id: new ObjectId(productId),
        });

        if (!product) {
          return res.status(404).send({ error: "Product not found." });
        }

        res.send(product);
      } catch (err) {
        res
          .status(500)
          .send({ error: "An error occurred while fetching data." });
      }
    });
    app.get("/api/all/products", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const perPage = 30;
      const skip = (page - 1) * perPage;

      const sortOrder = -1; // -1 for descending (latest order first) or 1 for ascending (oldest order first)

      try {
        const result = await productsCollection
          .find({ isBanned: { $ne: true } })
          .sort({ _id: sortOrder })
          .skip(skip)
          .limit(perPage)
          .toArray();

        res.send(result);
      } catch (err) {
        res
          .status(500)
          .send({ error: "An error occurred while fetching data." });
      }
    });
    //
    app.put("/api/product/views/:id", async (req, res) => {
      const productId = req.params.id;
      const newView = req.body.value;

      try {
        const product = await productsCollection.findOne({
          _id: new ObjectId(productId),
        });

        if (!product) {
          return res.status(404).send({ error: "Product not found." });
        }

        // Initialize views to 0 if not present
        const currentViews = product.views || 0;

        const updatedValue = currentViews + newView;
        await productsCollection.updateOne(
          { _id: new ObjectId(productId) },
          { $set: { views: updatedValue } }
        );

        res.send({ message: "Value updated successfully." });
      } catch (err) {
        res
          .status(500)
          .send({ error: "An error occurred while updating the value." });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("drug house mern server is running");
});
app.listen(port, () => {
  console.log(`drug house mern server is running on port, ${port}`);
});

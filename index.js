const express = require('express')
const app = express()
const port = process.env.PORT || 5000;
const cors = require("cors");
const jwt = require('jsonwebtoken');
const SSLCommerzPayment = require('sslcommerz-lts')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
// ssl commerz

const store_id = process.env.SSL_STORE_ID
const store_passwd = process.env.SSL_STORE_PASSWORD
const is_live = false //true for live, false for sandbox
// console.log(store_id, store_passwd)

// middleware
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send('Welcome to the bloom store!')
})


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.xazyemr.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// jwt middleware
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.send({ message: "Unauthorized user" })
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.send({ message: "Access forbidden" })
        }
        req.decoded = decoded
        next()
    })
}

async function run() {
    try {
        const usersCollection = client.db("Bloom-store").collection("users")
        const productsCollection = client.db("Bloom-store").collection("products")
        const cartCollection = client.db("Bloom-store").collection("cart")
        const wishlistCollection = client.db("Bloom-store").collection("wishlist")
        const ordersCollection = client.db("Bloom-store").collection("orders")
        // verify admin
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email
            const query = {
                email: decodedEmail
            }
            const user = await usersCollection.findOne(query)
            if (user?.status !== "admin") {
                return res.send({ message: "Access forbidden" })
            }
            next()
        }
        // get admin
        app.get('/users/admin', async (req, res) => {
            const email = req.query.email
            const query = {
                email: email
            }
            const user = await usersCollection.findOne(query)
            res.send({ isAdmin: user?.status === "admin" })
            // console.log(user)
        })
        // users collection
        app.post('/users', async (req, res) => {
            const userInfo = req.body
            const result = await usersCollection.insertOne(userInfo)
            res.send(result)
        })
        // ...users loginPopup 
        app.post('/users/popup', async (req, res) => {
            const user = req.body
            // console.log(user)
            const query = {
                email: user.email
            }
            const alreadyAddeduser = await usersCollection.findOne(query)
            if (!alreadyAddeduser) {
                const userCollection = await usersCollection.insertOne(user)
                return res.send(userCollection)
            }
            if (alreadyAddeduser) {
                return res.send(alreadyAddeduser)
            }

        })
        // jwt setup when user login and register
        app.get('/jwt', async (req, res) => {
            const email = req.query.email
            const query = {
                email: email
            }
            const user = await usersCollection.findOne(query)
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
                    expiresIn: '365d'
                })
                return res.send({ accessToken: token })
            }
            res.send({ accessToken: '' })
        })
        // get advertised products
        app.get('/advertised-products', async (req, res) => {
            const query = {
                advertised: "true"
            }
            const result = await productsCollection.find(query).toArray()
            res.send(result)
        })
        // top rated products
        app.get('/top-rated', async (req, res) => {
            const query = {
                rating: { $gte: 5 }
            }
            const result = await productsCollection.find(query).toArray()
            res.send(result)
        })
        //insert product to cart collection 
        app.post("/cart", verifyJWT, async (req, res) => {
            const cartInfo = req.body
            const query = {
                productId: cartInfo.productId,
                customerEmail: cartInfo.customerEmail
            }
            const alreadyAddedProduct = await cartCollection.findOne(query)
            if (!alreadyAddedProduct) {
                const result = await cartCollection.insertOne(cartInfo)
                return res.send(result)
            }
            if (alreadyAddedProduct) {
                return res.send({ acknowledged: false })
            }

        })
        //insert product to wishlist collection 
        app.post("/wishlist", verifyJWT, async (req, res) => {
            const cartInfo = req.body
            const query = {
                productId: cartInfo.productId,
                customerEmail: cartInfo.customerEmail
            }
            const alreadyAddedProduct = await wishlistCollection.findOne(query)
            if (!alreadyAddedProduct) {
                const result = await wishlistCollection.insertOne(cartInfo)
                return res.send(result)
            }
            if (alreadyAddedProduct) {
                return res.send({ acknowledged: false })
            }

        })
        // get cart data
        app.get('/get-cart', verifyJWT, async (req, res) => {
            const email = req.query.email
            const query = {
                customerEmail: email
            }
            const result = await cartCollection.find(query).toArray()
            res.send(result)
        })
        // get wish data
        app.get('/get-wish', verifyJWT, async (req, res) => {
            const email = req.query.email
            const query = {
                customerEmail: email
            }
            const result = await wishlistCollection.find(query).toArray()
            res.send(result)
        })
        app.delete('/delete-from-cart', verifyJWT, async (req, res) => {
            const id = req.query.id
            const query = {
                _id: new ObjectId(id)
            }
            const result = await cartCollection.deleteOne(query)
            res.send(result)
        })
        app.delete('/delete-from-wishlist', verifyJWT, async (req, res) => {
            const id = req.query.id
            const query = {
                _id: new ObjectId(id)
            }
            const result = await wishlistCollection.deleteOne(query)
            res.send(result)
        })
        // get product from product collection by id
        app.get("/product-by-id", async (req, res) => {
            const id = req.query.id
            const query = {
                _id: new ObjectId(id)
            }
            const result = await productsCollection.findOne(query)
            res.send(result)
        })

        // insert data into order collection
        app.post('/ordersList', verifyJWT, async (req, res) => {
            const orderInfo = req.body
            // console.log(orderInfo)

            // console.log(orderInfoString)
            const productId = orderInfo.productId
            const priceQuery = {
                _id: new ObjectId(productId)
            }
            const orderedProduct = await productsCollection.findOne(priceQuery)
            // console.log(orderedProduct?.price * orderInfo?.customerQuantity)
            const secureTotalAmount = orderedProduct?.price * orderInfo?.customerQuantity
            // console.log(secureTotalAmount)
            const transactionId = new ObjectId().toString()
            const data = {
                total_amount: secureTotalAmount,
                currency: 'BDT',
                tran_id: transactionId, // use unique tran_id for each api call
                success_url: `https://bloom-store-e8231.web.app/payment/success?transactionId=${transactionId}`,
                fail_url: `https://bloom-store-e8231.web.app/payment/fail?transactionId=${transactionId}`,
                cancel_url: `https://bloom-store-e8231.web.app/payment/fail?transactionId=${transactionId}`,
                ipn_url: `https://bloom-store-e8231.web.app/payment/fail?transactionId=${transactionId}`,
                shipping_method: 'Courier',
                product_name: orderInfo?.productName,
                product_category: orderInfo?.category,
                product_profile: 'general',
                cus_name: orderInfo?.customerName,
                cus_email: orderInfo?.customerEmail,
                cus_add1: orderInfo?.address,
                cus_add2: orderInfo?.address,
                cus_city: orderInfo?.city,
                cus_state: orderInfo?.city,
                cus_postcode: orderInfo?.postalCode,
                cus_country: 'Bangladesh',
                cus_phone: orderInfo?.phoneNumber,
                cus_fax: orderInfo?.phoneNumber,
                ship_name: orderInfo?.customerName,
                ship_add1: orderInfo?.address,
                ship_add2: orderInfo?.address,
                ship_city: orderInfo?.city,
                ship_state: orderInfo?.city,
                ship_postcode: orderInfo?.postalCode,
                ship_country: 'Bangladesh',
            };
            // console.log(data)
            const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
            sslcz.init(data).then(apiResponse => {
                // Redirect the user to payment gateway
                let GatewayPageURL = apiResponse.GatewayPageURL

                res.send({ url: GatewayPageURL })
                // console.log(apiResponse)
                // console.log('Redirecting to: ', GatewayPageURL)
                ordersCollection.insertOne({
                    ...orderInfo,
                    transactionId,
                    paid: "false"
                })
            });
            // const result = await ordersCollection.insertOne(orderInfo)
            // res.send(result)
        })
        // if success ssl get url request from server to insert order
        app.post('/payment/success', async (req, res) => {
            const transactionId = req.query.transactionId
            if (!transactionId) {
                return res.redirect("http://localhost:3000/payment/fail")
            }
            // update paid status when payment success
            const paidFilter = {
                transactionId: transactionId
            }
            const paidUpdated = {
                $set: {
                    paid: "true"

                }
            }
            const paidResult = await ordersCollection.updateOne(paidFilter, paidUpdated)

            // update quantity of productsCollection when payment is success 
            const quantityQuery = {
                transactionId: transactionId
            }
            const orderInfo = await ordersCollection.findOne(quantityQuery)
            // console.log(quantityResult)
            const productId = orderInfo.productId
            const quantity1 = orderInfo.quantity
            const customerQuantity = orderInfo.customerQuantity
            const newQuantity = quantity1 - customerQuantity
            // console.log(newQuantity)
            // console.log(productId, quantity1, customerQuantity, newQuantity)
            const quantityFilter = {
                _id: new ObjectId(productId)
            }
            const quantityUpdated = {
                $set: {
                    quantity: newQuantity

                }
            }
            const quantityResult = await productsCollection.updateOne(quantityFilter, quantityUpdated)

            if (paidResult.modifiedCount > 0 && quantityResult.modifiedCount > 0) {
                res.redirect(`http://localhost:3000/payment/success?transactionId=${transactionId}`)
            }
        })
        app.post('/payment/fail', async (req, res) => {
            const transactionId = req.query.transactionId
            if (!transactionId) {
                return res.redirect("http://localhost:3000/payment/fail")
            }
            const query = {
                transactionId: transactionId
            }
            const result = await ordersCollection.deleteOne(query)
            if (result.deletedCount === 1) {
                return res.redirect("http://localhost:3000/payment/fail")
            }
        })
        // get order by email 
        app.get('/getOrderEmail', verifyJWT, async (req, res) => {
            const email = req.query.email
            const query = {
                customerEmail: email
            }
            const result = await ordersCollection.find(query).sort({ orderDate: -1 }).toArray()
            res.send(result)
        })
        // get order by transaction id 
        app.get('/getOrderTrans', verifyJWT, async (req, res) => {
            const transactionId = req.query.transactionId
            const query = {
                transactionId: transactionId
            }
            const result = await ordersCollection.findOne(query)
            res.send(result)
        })

        /* app.put('/quantityUpdate', verifyJWT, async (req, res) => {
            const orderInfo = req.body
            const productId = orderInfo.productId
            const quantity1 = orderInfo.quantity
            const customerQuantity = orderInfo.customerQuantity
            const newQuantity = quantity1 - customerQuantity
            // console.log(newQuantity)
            // console.log(productId, quantity1, customerQuantity, newQuantity)
            const filter = {
                _id: new ObjectId(productId)
            }
            const dataUpdated = {
                $set: {
                    quantity: newQuantity

                }
            }
            const result2 = await productsCollection.updateOne(filter, dataUpdated)
            res.send(result2)
            // console.log(result2)
        }) */
        // get product by category 
        app.get('/getDataByCat', async (req, res) => {
            const category = req.query.category
            // console.log(category)
            const query = {
                category: category
            }
            const result = await productsCollection.find(query).toArray()
            res.send(result)
        })

        // admin section
        // get all product for admin 
        app.get('/allProduct', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {

            }
            const result = await productsCollection.find(query).sort({ category: 1, productName: 1 }).toArray()
            res.send(result)
        })
        // insert product by admin 
        app.post('/addNewProduct', verifyJWT, verifyAdmin, async (req, res) => {
            const productInfo = req.body
            const result = await productsCollection.insertOne(productInfo)
            res.send(result)
        })
        // delete product by admin 
        app.delete('/delete-from-products', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.query.id
            const query = {
                _id: new ObjectId(id)
            }
            const result = await productsCollection.deleteOne(query)
            res.send(result)
        })
        // edit product by admin 
        app.put("/edit-by-admin", verifyJWT, verifyAdmin, async (req, res) => {
            const editInfo = req.body
            const filter = {
                _id: new ObjectId(editInfo?.id)
            }
            const dataUpdated = {
                $set: {
                    productName: editInfo?.productName,
                    price: editInfo?.price,
                    quantity: editInfo?.quantity,
                    brand: editInfo?.brand,
                    advertised: editInfo?.advertised

                }
            }
            const result1 = await productsCollection.updateOne(filter, dataUpdated)
            res.send(result1)

        })
        // get all order by admin 
        app.get("/getOrderAdmin", verifyJWT, verifyAdmin, async (req, res) => {
            const query = {

            }
            const result = await ordersCollection.find(query).sort({ orderDate: -1 }).toArray()
            res.send(result)
        })
        // update delivery status 
        app.put('/updateDeliveryStatus', verifyJWT, verifyAdmin, async (req, res) => {
            const editInfo = req.body
            const _id = editInfo._id
            const filter = {
                _id: new ObjectId(_id)
            }
            const dataUpdated = {
                $set: {
                    deliveryStatus: editInfo?.deliveryStatus

                }
            }
            const result = await ordersCollection.updateOne(filter, dataUpdated)
            res.send(result)
        })
        // get all user by admin 
        app.get('/getAllUser', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {

            }
            const result = await usersCollection.find(query).toArray()
            res.send(result)
        })
        // get product by search 
        app.get('/search-text', async (req, res) => {
            const searchText = req.query.searchText
            const query = {
                $text: {
                    $search: searchText
                }
            }
            const result = await productsCollection.find(query).toArray()
            res.send(result)
        })
    }
    finally {

    }
}
run().catch(console.log)

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
require("dotenv").config();
const { MongoClient } = require("mongodb");

(async () => {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const db = client.db("uconnect");
    const cols = ["chatsessionmetrics", "chatfeedbacks", "chats"];
    for (const c of cols) {
      const coll = db.collection(c);
      const count = await coll.countDocuments();
      const latest = await coll.find().sort({ _id: -1 }).limit(1).toArray();
      console.log(
        `${c}: count=${count}`,
        latest[0]
          ? `latest_id_ts=${latest[0]._id.getTimestamp().toISOString()}`
          : "(empty)",
      );
    }
  } catch (e) {
    console.error("ERROR", e.message);
  } finally {
    await client.close();
  }
})();

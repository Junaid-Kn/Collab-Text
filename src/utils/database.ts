import cassandra from "cassandra-driver";
import { randomUUID } from "crypto";
const contactPoints = ["127.0.0.1:9042"];
const localDataCenter = "DC1";

export const client = new cassandra.Client({
  contactPoints,
  localDataCenter,
  keyspace: "editor",
});

export async function getFruitPrice(name: string) {
  const query =
    "SELECT name, price_p_item FROM grocery.fruit_stock WHERE name=? ALLOW FILTERING";

  try {
    const result = await client.execute(query, [name]);
    return result.rows?.[0]?.price_p_item ?? null;
  } catch (err) {
    console.error("Cassandra error:", err);
    throw err;
  }
}

export async function createDoc(name:string){
    const docId = randomUUID();
    const query = `INSERT INTO doc(id, name, value, last_updated) VALUES (?, ?, null, toTimeStamp(now())) IF NOT EXISTS`
    try{

        const result = await client.execute(query, [docId, name], {prepare:true});
        
        return result.wasApplied() && docId;
    }
    catch(error){
        console.log("Create Doc Error", error);
        throw error;
    }
}

export async function updateDoc(id: string, value:string){
     if (!id) {
        throw new Error("updateDoc called with missing id");
    }
    const query = `
    UPDATE editor.doc
    SET value = ?, last_updated = toTimestamp(now())
    WHERE id = ?
    `;
    try{ 
        // console.log(value);
        const result = await client.execute(query, [value, id], {prepare: true});
        return result;
    }
    catch(error){
        console.log(error)
        throw error;
    }
}

export async function getDocVal(id:string) { 
  const query =  `SELECT value FROM editor.doc where id= ? `
  
  try { 
    const result = await client.execute( query , [id], {prepare:true})
  
    return result;
  }
  catch(error){
    console.log(error);
    throw error;
  }

}
export async function getDocs(){
   const query = `
    SELECT * FROM editor.doc
    `;
    try{ 
        // console.log(value);
        const result = await client.execute(query);
        return result;
    }
    catch(error){
        console.log(error)
        throw error;
    }
}
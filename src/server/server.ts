    import express from "express"; 
    import cors from "cors";
    import http from "http"
    import { Server } from "socket.io"
    import { createDoc, updateDoc, getDocs, getDocVal } from "../utils/database";

    const app = express();
    const port = 3001

    const server = http.createServer(app)
    const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
    })
    app.use(express.json());
    app.use(cors());

    app.post("/api/overwrite", async (req, res) => { 
        const { textAreaMetaData } = req.body;
        console.log(textAreaMetaData)
        try{
            const result = await updateDoc(textAreaMetaData.docId, textAreaMetaData.value);
            if(!result) throw Error("Write didn't work");
            res.status(200).json({"message": "it works", result});

        }
        catch(error){
            console.log(error);
            throw error;
        }
        // res.status(200).json({message: "its good "})

    })
    app.post("/api/doc", async(req , res) => {
        const { docName } = req.body;

        try { 
            const result = await createDoc(docName);
            if(!result){
                throw Error("Failed to create Doc");

            }
            res.status(200).json({"docId": result});
        }
        catch(error){
            console.log(error);
            throw error;
        }

        
    })

    app.get("/api/docs", async(req , res) => {
        const result = await getDocs();
        if(!result || !result.rows){
            return;
        }

        res.status(200).json({"docs":[...result.rows]})
    })

    app.get("/api/docVal", async(req , res) => {
            const docId = req.query.id;   
            try{
                const request = await getDocVal(docId);
                if(!request || !request.rows){
                    return;
                }
                res.status(200).json({result: request});
            }
            catch(error){
                console.log(error)
                throw error;
                
            }

    })

    const docIdDic: Record<string, number> = {} 

    const userCursors = new Map<
            string, // docId
            Map<
                string, // socketId 
                {
                row: number;
                col: number;
                color: string;
                }
            >
            >();
    io.on('connection', (socket) => {
        socket.on("message", async (msg) => {
            console.log(msg);   
        })
        socket.on("doc_connect", async(docId) => {
            socket.join(docId);
            socket.emit("user_joined", socket.id); // send to self
            socket.to(docId).emit("user_joined", socket.id); // send to everyone else in the room 
            if(!Object.hasOwn(docIdDic, docId)){
                
                docIdDic[docId] = 1
            }
            else{
                docIdDic[docId] += 1
            }

           
            if (!userCursors.has(docId)) {
            userCursors.set(docId, new Map());
            }

            userCursors.get(docId)!.set(socket.id, {
            row: 1,
            col: 1,
            color: "#ff0000",
            });
            console.log('a user connected');    
        })

        socket.on("doc_write", async (userAndTextAreaMetaData)=> {
            try{
                userCursors.get(userAndTextAreaMetaData.docId)!.set(userAndTextAreaMetaData.userId,
                    {
                        row:userAndTextAreaMetaData.cursorRow,
                        col: userAndTextAreaMetaData.cursorCol,
                        color: userAndTextAreaMetaData.color
                    }
                );
                console.log(userCursors.get(userAndTextAreaMetaData.docId));


                const result = await updateDoc(userAndTextAreaMetaData.docId, userAndTextAreaMetaData.value);
                if(!result) throw Error("Write didn't work");
                socket.to(userAndTextAreaMetaData.docId).emit("doc_write", userAndTextAreaMetaData);

            }
            catch(error){
                console.log(error);
                throw error;
            }
        })
        socket.on("disconnect", async ()=> {
            
        })
        
    });



    server.listen(port, ()=> {
        console.log(`Listening on port ${port}`)
    })


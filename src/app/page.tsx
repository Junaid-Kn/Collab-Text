
"use client"
import { useState, useEffect, useCallback} from "react";
import { socket } from "@/utils/socket";
import { useRouter } from 'next/navigation'; // Make sure to import from /navigation

export default function Home() {

  const router = useRouter();
  const [ docName, setDocName] = useState("");
  const [ docId, setDocId] = useState("");
  const [allDocs, setAllDocs] = useState([]);
  
  
 const getDocs = useCallback(async () => {
  const request = await fetch("http://localhost:3001/api/docs", {
    method:"GET",
    mode: "cors"
  });
  const result = await request.json();
  if (!result || !result.docs) return [];
  return result.docs;
}, []);

useEffect(() => {
  const loadDocs = async () => {
    const docs = await getDocs();
    setAllDocs(docs);
  };
  loadDocs();
}, [getDocs]);

  const handleClick = async (e) => {
    try { 
      const response = await fetch("http://localhost:3001/api/doc", { 
        method: "POST",
        mode: "cors",
        headers: {
          "Content-type": "application/json",
        },
        body: JSON.stringify({docName})

      })
      const result = await response.json();
      console.log("result", result)
      console.log(result.docId);

      if (!result || !result.docId){
        return 
      }
    if (!result || !result.docId) {
      console.error("Failed to retrieve docId from server");
      return; 
    }

    setDocId(result.docId);
    
    router.push(`/doc/${result.docId}`); 
       

    }
    catch(error){
      console.log(error);
      throw error;
    }
  }
  
  
  return (
    <>
      <label htmlFor="docName" className="text-black">Enter a doc Name</label>
      <input type="text" name="docName" className="text-black border-2 w-50" onChange={(e)=> setDocName(e.target.value)}/> 
      <button onClick={handleClick} className="text-black border-3 h-10 w-30 hover:bg-green-300"> Generate Doc</button>

      <div className="border-5 border-black">
        {allDocs.map((doc: any) => (
          <div key={doc.id} className="text-black border p-2">
           <a href={`http://localhost:3000/doc/${doc.id}`}>{doc.name} </a> 
          </div>
        ))}
      </div>
    </>
    
  );
}

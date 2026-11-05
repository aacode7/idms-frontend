"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
const api=process.env.NEXT_PUBLIC_IDMS_API_URL??"http://localhost:8000/api/v1";
type Version={id:string;version_number:number;created_at:string;download_url:string};
export default function VersionsPage(){const {documentId}=useParams<{documentId:string}>();const [versions,setVersions]=useState<Version[]>([]);const [error,setError]=useState("");useEffect(()=>{fetch(`${api}/documents/${documentId}/versions`).then(r=>r.ok?r.json():Promise.reject()).then(setVersions).catch(()=>setError("Versions are unavailable."))},[documentId]);return <main className="shell"><a href="/dashboard">← Dashboard</a><p className="eyebrow">VERSION HISTORY</p><h1>Document versions</h1>{error?<p>{error}</p>:<ul>{versions.map(v=><li key={v.id}>Version {v.version_number} · {new Date(v.created_at).toLocaleString()} · <a href={v.download_url}>Download DOCX</a></li>)}</ul>}</main>}

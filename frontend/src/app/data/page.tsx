import Link from "next/link";
import { Database, FileUp, ArrowUpRight } from "lucide-react";
import { demos } from "@/lib/demos";
import { Button } from "@/components/ui/button";
import { ConnectionCheck } from "@/components/connection-check";
export const metadata = { title: "Data · ZeroCast" };
export default function Data() {
  return (
    <section className="data-sources">
      <div className="page-heading">
        <h1>Data</h1>
        <p>Choose a saved dataset or prepare a file for forecasting.</p>
      </div>
      <div className="source-grid">
        {demos.map((demo) => (
          <article key={demo.id}>
            <span className="badge">REAL DATA · SAVED FORECAST</span>
            <h2>{demo.title}</h2>
            <p>{demo.description}</p>
            <div className="download-actions">
              <Button asChild>
                <Link href={`/forecast/${demo.id}`}>
                  Open forecast <ArrowUpRight size={14} />
                </Link>
              </Button>
              <Link className="text-link" href={`/data-health/demo/${demo.id}`}>
                Data quality
              </Link>
            </div>
          </article>
        ))}
        <article>
          <FileUp size={20} />
          <h2>Upload file</h2>
          <p>CSV, Excel, Parquet or JSON · long or wide · hierarchy IDs.</p>
          <div className="download-actions">
            <Button asChild variant="outline">
              <Link href="/upload">Choose file</Link>
            </Button>
            <a
              className="text-link"
              href="/templates/zerocast-template.csv"
              download
            >
              Template
            </a>
          </div>
        </article>
        <article>
          <Database size={20} />
          <h2>Google Sheets</h2>
          <p>
            Import a published CSV export; private sheets need a file export.
          </p>
          <Link className="text-link" href="/upload">
            Import published sheet ↗
          </Link>
          <p className="health-note">Database connections: coming soon.</p>
        </article>
      </div>
      <details className="api-details">
        <summary>API connection</summary>
        <ConnectionCheck />
      </details>
    </section>
  );
}

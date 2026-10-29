import { Hint } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import Link from "next/link";
export const metadata = { title: "Covariate research · ZeroCast" };
export default function Research() {
  return (
    <article className="health-page research-page">
      <Link className="text-link" href="/under-the-hood">
        ← Model & method
      </Link>
      <PageHeader
        eyebrow="Project Research · Historical Experiment"
        title={<>Why sales-only comes first.</>}
      />
      <p className="lede">
        A summary of the project’s recorded covariate experiments, not a live
        deployment benchmark.
      </p>
      <section>
        <h2>What was tested</h2>
        <p>
          The project compared sales-only forecasts with historical-driver
          forecasts, target tiling, masked future-driver positions, true future
          values and wrong-window controls. The recorded setup used model
          version 0.1.1, main revision 2ad7da7 plus PR revision 4b1de57, with
          real weights. These are experiment revisions, not a claim about the
          running API.
        </p>
        <p>
          EPF hourly electricity prices for France and Belgium were the full
          run: 12 origins × 2 item, with 100 samples. Cross-market prices and
          rohlik_sales_1D were smaller checks. The experiment scripts live
          outside this app repository.
        </p>
      </section>
      <section>
        <h2>Recorded findings</h2>
        <p>
          For periods 1–64, the driver path had higher WQL than sales-only in
          all three tested settings. Lower WQL is better.
        </p>
        <div
          className="health-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Historical research results"
        >
          <table>
            <caption>Project experiment record · periods 1–64</caption>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Sales-only WQL</th>
                <th>With drivers WQL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>EPF</th>
                <td>0.103</td>
                <td>0.121</td>
              </tr>
              <tr>
                <th>Cross-price</th>
                <td>0.131</td>
                <td>0.147</td>
              </tr>
              <tr>
                <th>Rohlik</th>
                <td>0.195</td>
                <td>0.238</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          For EPF, masking future-driver positions rather than filling them with
          sampled targets reduced WQL by 27%, 26% and 33% in periods 65–128,
          129–192 and 193–256 respectively. It matched sales-only accuracy in
          that run. True future driver values did not outperform the
          wrong-window controls in the tested architecture. Masking and tiling
          tied on the two smaller checks.
        </p>
      </section>
      <section>
        <h2>How much to trust this evidence</h2>
        <p>
          Two settings were quick runs. France and Belgium prices were highly
          correlated, with about 46% identical values, and EPF covered one
          season from June to October 2016. Masked all-missing timesteps
          depended on a NaN guard for older runtime versions. These observations
          are limited experiments, not universal model behaviour or current
          performance guarantees.
        </p>
      </section>
      <section>
        <h2>What it means in ZeroCast</h2>
        <ul>
          <li>Sales-only stays the default.</li>
          <li>
            drivers are an optional historical check, limited to 64 forecast
            periods.
          </li>
          <li>
            A statistical relationship and a gain in forecast accuracy remain
            separate findings.
          </li>
          <li>
            Future promotion scenarios are not inferred from these experiments.
          </li>
        </ul>
        <Hint>
          Source: the repository’s docs/RESEARCH.md and docs/YUG_NOTES.md. This
          page summarises the recorded evidence; it does not rerun the
          experiments. Read the source discussion for context and subsequent
          updates.
        </Hint>
        <a
          className="text-link"
          href="https://github.com/birla-ai-labs/yug/issues/15"
          target="_blank"
          rel="noreferrer"
        >
          Open the research discussion · issue #15 ↗
        </a>
      </section>
    </article>
  );
}

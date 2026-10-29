import Link from "next/link";
import { PageHeader } from "@/components/ui/layout";
import { Hint } from "@/components/ui/feedback";
import { StatCard, StatGrid } from "@/components/ui/stat";
import { ModelDeployment } from "@/components/model-deployment";
export const metadata = { title: "Model & method · ZeroCast" };
export default function UnderTheHood() {
  return (
    <div className="health-page model-page">
      <PageHeader
        eyebrow="Model & Method"
        title={<>Model &amp; method</>}
        description={
          <>
            Model provenance, live API reports and practical limits in one
            place.
          </>
        }
      />
      <section className="model-reference" aria-labelledby="reference-heading">
        <div>
          <p className="eyebrow">PUBLISHED MODEL REFERENCE</p>
          <h2 id="reference-heading">Powered by the Yug foundation model</h2>
          <p>
            The intended foundation model forecasts new items from their history
            without training a model for each dataset. Deployment identity and
            readiness are reported separately below.
          </p>
          <StatGrid>
            <StatCard
              label="Published parameters"
              value={<>271.8M</>}
              hint={<>271,845,260 parameters</>}
            />
            <StatCard
              label="Published context"
              value={<>2,048</>}
              hint={<>Historical points per context</>}
            />
            <StatCard
              label="Native output"
              value={<>P10–P90</>}
              hint={<>Nine forecast levels · 64-period blocks</>}
            />
          </StatGrid>
          <Hint>
            Reference facts from the{" "}
            <a
              className="text-link"
              href="https://huggingface.co/birlaailabs/yug"
              target="_blank"
              rel="noreferrer"
            >
              official model card ↗
            </a>
            . They are not fallback deployment values.
          </Hint>
        </div>
      </section>
      <ModelDeployment />
      <section className="model-limits" aria-labelledby="limits-heading">
        <h2 id="limits-heading">Phase 1 limits</h2>
        <div className="model-limit-grid">
          <article>
            <h3>Bring usable history</h3>
            <ul>
              <li>
                Raw browser input: up to 1 GB; browser memory may impose a lower
                limit.
              </li>
              <li>Prepared Parquet upload: up to 50 MB.</li>
              <li>At least 30 known target points per item.</li>
              <li>Up to 10 numeric driver columns.</li>
            </ul>
          </article>
          <article>
            <h3>Run within the supported range</h3>
            <ul>
              <li>Forecast: up to 256 periods and 100 item per run.</li>
              <li>
                Service level: 50–90%, using the supplied total distribution.
              </li>
              <li>
                Drivers: one item, up to 10 drivers, horizon up to 64 periods.
              </li>
              <li>Exceptions: up to 20 item per replay job.</li>
            </ul>
          </article>
        </div>
        <p>
          Sales-only is the default. Historical driver checks are optional and
          do not estimate the effects of future promotions or planned changes.
          Forecast ranges are estimates; data quality and changing conditions
          can reduce reliability.
        </p>
        <Hint>
          Horizon totals come from sample-path distributions. Per-period
          quantiles are never added to create totals. The model worker processes
          jobs in a queue, so wait time may exceed a single model call. The
          retail and manufacturing demos show precomputed results from real
          historical data and do not start a new model run. The cement driver
          demo also shows saved statistical and model backtest results.
        </Hint>
      </section>
      <section className="model-license" aria-labelledby="license-heading">
        <p className="eyebrow">ATTRIBUTION & LICENCE</p>
        <h2 id="license-heading">Separate terms for weights and code</h2>
        <p>
          Foundation model created by Birla AI Labs. Model authors: Aaditya
          Jain, Debdeep Sanyal, Aaryan Nagpal, Dhruv Kumar, Murari Mandal and
          Saurabh Deshpande (2026). This attribution does not imply endorsement
          of ZeroCast.
        </p>
        <p>
          Published model weights:{" "}
          <a
            className="text-link"
            href="https://creativecommons.org/licenses/by-nc/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-NC 4.0 ↗
          </a>
          , with attribution and non-commercial terms. Upstream model code:
          Apache-2.0, licensed separately. Review the original terms before
          using or redistributing the model.
        </p>
        <Hint>
          ZeroCast wraps the model for validation, queued inference, sample-path
          totals and UI presentation. The API reports its configured model and
          revision; it does not verify modifications to the underlying weights.
        </Hint>
        <div className="download-actions">
          <a
            className="text-link"
            href="https://huggingface.co/birlaailabs/yug#license"
            target="_blank"
            rel="noreferrer"
          >
            Weights and model card ↗
          </a>
          <a
            className="text-link"
            href="https://github.com/birla-ai-labs/yug#license"
            target="_blank"
            rel="noreferrer"
          >
            Upstream code and licence ↗
          </a>
        </div>
      </section>
      <section className="model-research" aria-labelledby="research-heading">
        <p className="eyebrow">RESEARCH BEHIND THE DEFAULTS</p>
        <h2 id="research-heading">Why start with sales-only?</h2>
        <p>
          Project experiments found that supplying historical drivers did not
          consistently improve forecasts. Those results inform the default and
          the separate lenses in Drivers; they are not a promise about every
          dataset or the current deployment.
        </p>
        <div className="download-actions">
          <Link className="text-link" href="/under-the-hood/research">
            Read the project research summary →
          </Link>
          <a
            className="text-link"
            href="https://github.com/birla-ai-labs/yug/issues/15"
            target="_blank"
            rel="noreferrer"
          >
            Research discussion · issue #15 ↗
          </a>
          <a
            className="text-link"
            href="https://github.com/birla-ai-labs/yug/issues/9"
            target="_blank"
            rel="noreferrer"
          >
            Related rollout-state issue · #9 ↗
          </a>
        </div>
      </section>
    </div>
  );
}

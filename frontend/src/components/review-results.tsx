"use client";
import { useEffect, useRef, useState } from "react";
import { formatPeriod, type Frequency } from "@/lib/dates";
import { valueFormatter } from "@/lib/numbers";
import { findDemo } from "@/lib/demos";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExceptionCalendar } from "./exception-calendar";
import { getAnnotations, saveAnnotation } from "@/lib/api/review";
import {
  eventKey,
  reviewCsv,
  reviewGroups,
  type Annotation,
  type Event,
  type Review,
} from "@/lib/review";
export function ReviewResults({
  review,
  frequency,
  id,
  country,
  synthetic = false,
  readOnly = false,
}: {
  review: Review;
  frequency: Frequency;
  id: string;
  country?: string | null;
  synthetic?: boolean;
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState(review.series[0]?.series_id || "");
  const [editing, setEditing] = useState<{
    series: string;
    event: Event;
    text: string;
  }>();
  const [notice, setNotice] = useState("");
  const trigger = useRef<HTMLButtonElement | null>(null);
  function closeEditor(saved = false) {
    if (saved) setNotice("Note saved.");
    setEditing(undefined);
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
    });
  }
  const notes = useQuery({
    queryKey: ["annotations", id],
    queryFn: ({ signal }) => getAnnotations(id, signal),
    enabled: !synthetic && !readOnly,
  });
  const series =
    review.series.find((s) => s.series_id === selected) ?? review.series[0];
  const locale = country === "IN" ? "en-IN" : undefined;
  const number = (v: number) =>
    valueFormatter({ country, unit: findDemo(id)?.unit }).format(v);
  const signed = (v: number) =>
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
      signDisplay: "always",
    }).format(v);
  const note = (event: Event) =>
    notes.data?.find(
      (a) =>
        eventKey(a.series_id, a.date) ===
        eventKey(series!.series_id, event.date),
    )?.text ??
    event.annotation ??
    "";
  function download() {
    const url = URL.createObjectURL(
      new Blob([reviewCsv(review, notes.data)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "zerocast-year-review.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!series)
    return (
      <section className="route-state">
        <h2>No review item returned.</h2>
        <p>Choose other item or replay settings and run again.</p>
      </section>
    );
  const groups = reviewGroups(series);
  function eventCard(event: Event, category: string) {
    const text = note(event);
    return (
      <article className="review-event" key={event.date}>
        <p className="eyebrow">{category}</p>
        <h4>{formatPeriod(event.date, frequency)}</h4>
        <div className="review-event-tags">
          {event.calendar_events?.length ? (
            event.calendar_events.map((tag, i) => (
              <span key={`${tag}-${i}`} className="badge">
                {tag}
              </span>
            ))
          ) : (
            <span className="health-note">No known event — what happened?</span>
          )}
        </div>
        <p
          className={`review-delta${event.actual < event.expected_p50 ? " is-negative" : ""}`}
        >
          {event.actual >= event.expected_p50 ? "+" : "−"}
          {number(Math.abs(event.actual - event.expected_p50))}{" "}
          <span> / {signed(event.deviation_pct)}%</span>
        </p>
        <p>
          Actual {number(event.actual)} · Base case (P50){" "}
          {number(event.expected_p50)}
        </p>
        <p className="health-note">
          P10:{" "}
          {event.expected_p10 === undefined
            ? "Not supplied"
            : number(event.expected_p10)}{" "}
          · P90:{" "}
          {event.expected_p90 === undefined
            ? "Not supplied"
            : number(event.expected_p90)}
        </p>
        {event.recurring_as_expected && (
          <p className="review-expected-note">
            In line with forecast — the source reports this recurring event
            stayed inside the forecast forecast range.
          </p>
        )}
        {text && (
          <blockquote className="review-annotation">
            <strong>Note</strong>
            <p>{text}</p>
          </blockquote>
        )}
        {!synthetic && !readOnly && (
          <Button
            variant="outline"
            disabled={!notes.isSuccess}
            onClick={(e) => {
              trigger.current = e.currentTarget;
              setNotice("");
              setEditing({ series: series!.series_id, event, text });
            }}
          >
            {text ? "Edit note" : "Add note"}
            <span className="sr-only">
              {" "}
              for {formatPeriod(event.date, frequency)}
            </span>
          </Button>
        )}
      </article>
    );
  }
  return (
    <section className="review-results" aria-label="Exceptions results">
      <div className="health-section-heading">
        <div>
          <p className="eyebrow">
            {synthetic
              ? "SAVED SYNTHETIC REVIEW"
              : readOnly
                ? "PRECOMPUTED REVIEW"
                : "REPLAY RESULTS"}
          </p>
          <h2>What surprised you?</h2>
        </div>
        <Button variant="outline" onClick={download}>
          Export all review events
        </Button>
      </div>
      <div className="forecast-controls">
        <label>
          Item
          <select
            aria-label="Item"
            value={series.series_id}
            onChange={(e) => setSelected(e.target.value)}
          >
            {review.series.map((s) => (
              <option key={s.series_id}>{s.series_id}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="health-stats">
        <article>
          <span>
            {series.aggregation === "mean"
              ? "Actual average per period"
              : "Actual backtest total"}
          </span>
          <strong>
            {series.actual_total === undefined
              ? "Not supplied"
              : number(series.actual_total)}
          </strong>
          <small>
            {series.aggregation === "mean"
              ? "Source mean over backtest periods"
              : "Source aggregate for backtest periods"}
          </small>
        </article>
        <article>
          <span>
            {series.aggregation === "mean"
              ? "Base case average per period"
              : "Base case backtest total"}
          </span>
          <strong>
            {series.expected_total === undefined
              ? "Not supplied"
              : number(series.expected_total)}
          </strong>
          <small>Source aggregate, not a sum of ranked events</small>
        </article>
        <article>
          <span>Range accuracy</span>
          <strong>
            {series.band_coverage === undefined
              ? "Not supplied"
              : `${number(series.band_coverage * 100)}%`}
          </strong>
          <small>Coverage over backtest periods</small>
        </article>
      </div>

      {synthetic || readOnly ? (
        <p className="demo-notice">
          {synthetic
            ? "Illustrative events, calendar tags and replay totals. No model was run."
            : "Saved replay results from real historical data. No new model run."}{" "}
          Upload your own data to save notes.
        </p>
      ) : (
        <div className="review-note-status">
          {notes.isPending && <p role="status">Loading saved notes…</p>}
          {notes.isError && (
            <div role="alert">
              <p>
                {notes.error.message} Notes are read-only until they can be
                loaded.
              </p>
              <Button variant="outline" onClick={() => notes.refetch()}>
                Retry notes
              </Button>
            </div>
          )}
          <p role="status">{notice}</p>
        </div>
      )}
      {!synthetic && (
        <ExceptionCalendar
          id={id}
          series={series}
          saved={readOnly}
          frequency={frequency}
        />
      )}
      <div className="review-lists">
        <section aria-labelledby="positive-heading">
          <h3 id="positive-heading">Demand spikes</h3>

          {groups.positive.length ? (
            groups.positive.map((e) => eventCard(e, "Demand spike"))
          ) : (
            <p className="health-table-empty">No demand spikes returned.</p>
          )}
        </section>
        <section aria-labelledby="misses-heading">
          <h3 id="misses-heading">Demand drops</h3>

          {groups.misses.length ? (
            groups.misses.map((e) => eventCard(e, "Demand drop"))
          ) : (
            <p className="health-table-empty">No demand drops returned.</p>
          )}
        </section>
      </div>
      <section
        aria-labelledby="expected-heading"
        className="review-as-expected"
      >
        <h3 id="expected-heading">In line with forecast</h3>

        <div className="review-expected-grid">
          {groups.expected.length ? (
            groups.expected.map((e) => eventCard(e, "In line with forecast"))
          ) : (
            <p className="health-table-empty">
              No recurring events were flagged as expected in this result.
            </p>
          )}
        </div>
      </section>
      <details className="provenance">
        <summary>Where these results come from</summary>
        <p>
          The review job replays historical forecast origins. Actual, expected
          P50, P10/P90, percentage deviation, calendar tags, coverage and totals
          are supplied by the review result. Lists rank returned events by
          |actual − expected P50| and show at most five per exception category.
          Only the recurring_as_expected flag marks an event as expected; the
          page does not infer festival dates or reasons. Missing optional values
          remain unavailable.
        </p>
        <p>
          The date and time are displayed without local timezone conversion.
          Calendar dates are descriptive context. No rupee impact is estimated
          because the API does not supply price or revenue impact fields.
        </p>
      </details>
      {editing && (
        <AnnotationDialog
          key={eventKey(editing.series, editing.event.date)}
          id={id}
          series={editing.series}
          event={editing.event}
          frequency={frequency}
          initialText={editing.text}
          close={() => closeEditor()}
          saved={() => closeEditor(true)}
        />
      )}
    </section>
  );
}
function AnnotationDialog({
  id,
  series,
  event,
  frequency,
  initialText,
  close,
  saved,
}: {
  id: string;
  series: string;
  event: Event;
  frequency: Frequency;
  initialText: string;
  close: () => void;
  saved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(initialText);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      saveAnnotation(id, {
        series_id: series,
        date: event.date,
        text: text.trim(),
      }),
    onSuccess: (annotation) => {
      client.setQueryData<Annotation[]>(["annotations", id], (current) => [
        ...(current ?? []).filter(
          (a) =>
            eventKey(a.series_id, a.date) !==
            eventKey(annotation.series_id, annotation.date),
        ),
        annotation,
      ]);
      saved();
    },
  });
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="annotation-heading"
      className="annotation-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!mutation.isPending) close();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() && text.length <= 500 && !mutation.isPending)
            mutation.mutate();
        }}
      >
        <h2 id="annotation-heading">Add context to this event</h2>
        <p>
          {series} · {formatPeriod(event.date, frequency)}
        </p>
        <label htmlFor="annotation-text">What happened?</label>
        <textarea
          id="annotation-text"
          maxLength={500}
          rows={6}
          value={text}
          disabled={mutation.isPending}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="health-note">
          {text.length}/500 characters · Saved for this dataset, item and date.
        </p>
        {mutation.isError && (
          <p role="alert">{mutation.error.message} Your note is still here.</p>
        )}
        <div className="download-actions">
          <Button type="submit" disabled={!text.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save note"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={close}
          >
            Cancel
          </Button>
        </div>
      </form>
    </dialog>
  );
}

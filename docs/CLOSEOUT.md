# MarginPack development decision

Development and promotion stopped on 2026-11-06. Version 0.1.2 remains the last release. The source, MIT license, release files and historical validation record remain available. No new features, fixes, compatibility checks, CI reruns or releases are scheduled. Restarting requires a new explicit instruction from the owner.

This is a product-investment decision. Existing tests demonstrate the behavior exercised in their recorded environments; they do not demonstrate adoption, market size or willingness to change workflows. The last release must not be described as compatible with future Zotero versions.

## Why investment stopped

MarginPack exports an existing single-file Zotero HTML snapshot and its native annotations into a standalone, read-only reader. Its defensible distinction is avoiding reannotation outside Zotero while retaining whole-page reading context. That is a narrow workflow distinction whose practical demand has not been established.

- [SingleFile](https://www.getsinglefile.com/) already offers webpage capture, highlights, notes and self-contained offline HTML. Offline annotated HTML is not a new product category. Its native consumption of existing Zotero annotations was not established in this review.
- [Zotero's own annotation-to-note workflow](https://forums.zotero.org/discussion/115743/save-as-export-function-for-the-website-snapshot) exports quoted passages, comments and citations. Many sharing tasks may need only that output.
- [Zotero-Dashboard](https://github.com/itofrrr/Zotero-Dashboard) already offers offline HTML annotation collections. The reviewed implementation did not include original snapshot text with annotation positions; that difference alone does not establish demand for another tool.
- [Zotsite](https://github.com/plandes/zotsite#readme) exports a Zotero library and saved snapshots as a static site. Modern native webpage-annotation rendering was not established by its documentation.

The two forum threads initially cited in the README contain five distinct people requesting related behavior, but only two explicitly request HTML export; one also requires subsequent editing. The other requests include printing or PDF output, which MarginPack does not implement. These are problem reports, not five validated customers, and not a representative market sample. Sources: [preserving annotation colors](https://forums.zotero.org/discussion/113670/save-export-annotated-html-snapshot-with-all-annotated-text-colors-preserved) and [snapshot export](https://forums.zotero.org/discussion/115743/save-as-export-function-for-the-website-snapshot).

No external user completing a real task with MarginPack had been independently verified when investment stopped. Release downloads included our own checks and cannot be counted as users. Zotero's overall ecosystem population cannot be substituted for the number using compatible HTML snapshots and needing this export.

## What went wrong

These are conclusions from the research references and delivery sequence, not claims that every earlier search has been reconstructed.

1. **The initial question was too close to a feature request.** An export request became a build specification before identifying frequency, current workaround, receiver requirements and the benefit needed to justify installing another plugin.
2. **Substitutes were underweighted.** The original request itself mentioned SingleFile. Treating it mainly as a capture tool missed the importance of its existing annotation and offline-sharing features. There was no adequate comparison of the user's complete task across strong alternatives before implementation.
3. **Demand evidence was overextended.** Related requests for HTML, PDF, printing and editing were not separated early enough. A few public reports established a problem worth investigating, not a product worth prioritizing.
4. **There was no enforced investment gate.** Technical feasibility, working code and test results became reasons to continue. Demand, acquisition and recurring maintenance had not first met an adequate standard. Testing was necessary for the software we released; choosing to invest that far before validating the product was the mistake.
5. **Distribution was considered too late.** A repository, release and profile link provide a destination. They do not establish a repeatable way to reach qualified users. Forum authentication and channel rules further limited the available launch routes.

These were responsibilities of the product evaluation, not information the owner should have had to request after development.

## Requirements for future product decisions

Before substantial implementation, establish the concrete user and task, independent current problem evidence, strongest native/free/paid substitutes, measurable remaining advantage, reachable adoption channel, and the smallest experiment that could disprove the idea. Separate facts, hypotheses and proposed targets.

Compare the existing workflow with the proposed result using the same real or appropriately synthetic task. Establish whether a focused upstream fix would serve users better than a separate product. Estimate addressable users only when the denominator and narrowing inputs are supported; never use stars, downloads, ecosystem totals or invented percentages as substitutes.

Define implementation scope, ongoing compatibility burden, permissions, data exposure, resource limit and stop conditions before progressing. Public research can qualify a hypothesis; it cannot certify product-market fit or prove that no competitor exists worldwide. Independent implementation does not itself demonstrate innovation.

The closeout changes only documentation. It does not alter the exporter, update manifest, released packages or historical test records, and does not require rerunning the application tests.

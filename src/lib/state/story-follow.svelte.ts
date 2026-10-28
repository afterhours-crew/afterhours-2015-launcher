// Called while a component that shows the story starts: the story is read
// once if nothing has been read yet, and read again every few seconds while
// a game runs and the component is open (./story-live.ts).

import { onMount, untrack } from "svelte";
import { featureReady } from "./capabilities";
import { isLive } from "./launchbar";
import { records } from "./records.svelte";
import { session } from "./session.svelte";

export function followStory(): void {
  onMount(() => records.storyLive.retain());
  $effect(() => {
    records.storyLive.setLive(
      isLive(session.status?.state) && session.status?.game_running === true,
    );
  });
  $effect(() => {
    if (featureReady(session.info?.server, "story"))
      untrack(() => {
        if (records.story.kind === "idle") void records.loadStory();
      });
  });
}

<script lang="ts">
  // The Garage home has no car render; the floor holds the clock instead.
  let now = $state(new Date());
  $effect(() => {
    const timer = setInterval(() => (now = new Date()), 10_000);
    return () => clearInterval(timer);
  });
  let time = $derived(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  let date = $derived(
    now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }),
  );
</script>

<div class="clock ah-on-art">
  <span class="t-clock">{time}</span>
  <span class="date">{date}</span>
</div>

<style>
  .clock {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .date {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
</style>

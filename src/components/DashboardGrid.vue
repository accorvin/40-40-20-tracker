<template>
  <div class="container mx-auto px-6 py-6">
    <div v-if="boards.length === 0" class="text-center py-12 text-gray-500">
      <svg
        class="h-16 w-16 mx-auto mb-4 text-gray-300"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
      <p class="text-lg">No team boards found.</p>
      <p>Click Refresh to fetch boards from Jira.</p>
    </div>

    <template v-else>
      <div data-testid="allocation-legend" class="flex items-center gap-4 mb-4 text-sm text-gray-600 flex-wrap">
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-sm bg-amber-400"></span>
          Tech Debt & Quality (40%)
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-sm bg-blue-400"></span>
          New Features (40%)
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-sm bg-green-400"></span>
          Learning & Enablement (20%)
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-sm bg-gray-400"></span>
          Uncategorized
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <TeamCard
          v-for="board in boards"
          :key="board.id"
          :board="board"
          :sprintData="boardSprintData[board.id] || null"
          @select-team="$emit('select-team', $event)"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import TeamCard from './TeamCard.vue'

defineProps({
  boards: {
    type: Array,
    default: () => []
  },
  boardSprintData: {
    type: Object,
    default: () => ({})
  }
})

defineEmits(['select-team'])
</script>

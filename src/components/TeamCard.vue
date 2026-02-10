<template>
  <div
    class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md hover:border-primary-300 transition-all cursor-pointer"
    @click="$emit('select-team', board)"
  >
    <h3 class="font-semibold text-gray-900 truncate">{{ board.displayName || board.name }}</h3>

    <template v-if="sprintData">
      <div class="flex items-center gap-2 mt-1">
        <span class="text-sm text-gray-600">{{ sprintData.sprint.name }}</span>
        <SprintStatusBadge :state="sprintData.sprint.state" />
      </div>

      <div class="text-xs text-gray-400 mt-0.5">
        {{ formatDate(sprintData.sprint.startDate) }} – {{ formatDate(sprintData.sprint.endDate) }}
      </div>

      <div class="mt-3">
        <AllocationBar :buckets="sprintData.summary.buckets" :totalPoints="sprintData.summary.totalPoints" />
      </div>

      <div class="flex items-center justify-between mt-2 text-sm">
        <span class="text-gray-600">
          <span class="font-medium">{{ sprintData.summary.totalPoints }}</span> pts
        </span>
        <span
          v-if="sprintData.summary.unestimatedIssueCount > 0"
          data-testid="unestimated-count"
          class="text-amber-600"
        >
          {{ sprintData.summary.unestimatedIssueCount }} unestimated
        </span>
        <span v-else class="text-gray-400 text-xs">All estimated</span>
      </div>

      <div v-if="sprintData.sprint.state === 'closed' && sprintData.summary.totalPoints > 0" class="mt-1 text-xs text-gray-500">
        Completed: {{ completionPercent }}%
      </div>
    </template>

    <p v-else class="text-sm text-gray-500 mt-1">No sprint data</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SprintStatusBadge from './SprintStatusBadge.vue'
import AllocationBar from './AllocationBar.vue'

const props = defineProps({
  board: {
    type: Object,
    required: true
  },
  sprintData: {
    type: Object,
    default: null
  }
})

defineEmits(['select-team'])

const completionPercent = computed(() => {
  if (!props.sprintData || props.sprintData.summary.totalPoints === 0) return 0
  const completedPoints = Object.values(props.sprintData.summary.buckets)
    .reduce((sum, b) => sum + (b.completedPoints || 0), 0)
  return Math.round((completedPoints / props.sprintData.summary.totalPoints) * 100)
})

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

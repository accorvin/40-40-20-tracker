<template>
  <div
    class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md hover:border-primary-300 transition-all cursor-pointer"
    @click="$emit('select-project', project)"
    data-testid="project-card"
  >
    <div class="flex items-center justify-between">
      <h3 class="font-semibold text-gray-900 truncate">{{ project.name }}</h3>
      <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{{ project.pillar }}</span>
    </div>

    <template v-if="totalPoints > 0">
      <div class="mt-3">
        <AllocationBar :buckets="aggregatedBuckets" :totalPoints="totalPoints" />
      </div>

      <div class="flex items-center justify-between mt-2 text-sm">
        <span class="text-gray-600">
          <span class="font-medium">{{ totalPoints }}</span> pts
        </span>
        <span class="text-gray-500">
          {{ boardCount }} {{ boardCount === 1 ? 'board' : 'boards' }}
        </span>
      </div>
    </template>

    <p v-else class="text-sm text-gray-500 mt-3">No data available</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AllocationBar from './AllocationBar.vue'

const props = defineProps({
  project: {
    type: Object,
    required: true
  },
  summary: {
    type: Object,
    default: null
  }
})

defineEmits(['select-project'])

const boardCount = computed(() => {
  if (!props.summary?.boards) return 0
  return Object.keys(props.summary.boards).length
})

const totalPoints = computed(() => {
  if (!props.summary?.boards) return 0
  return Object.values(props.summary.boards)
    .reduce((sum, b) => sum + (b?.summary?.totalPoints || 0), 0)
})

const aggregatedBuckets = computed(() => {
  if (!props.summary?.boards) return {}
  const buckets = {
    'tech-debt-quality': { points: 0, issueCount: 0, completedPoints: 0 },
    'new-features': { points: 0, issueCount: 0, completedPoints: 0 },
    'learning-enablement': { points: 0, issueCount: 0, completedPoints: 0 },
    'uncategorized': { points: 0, issueCount: 0, completedPoints: 0 }
  }
  for (const boardData of Object.values(props.summary.boards)) {
    if (!boardData?.summary?.buckets) continue
    for (const [key, bucket] of Object.entries(boardData.summary.buckets)) {
      if (buckets[key]) {
        buckets[key].points += bucket.points || 0
        buckets[key].issueCount += bucket.issueCount || 0
        buckets[key].completedPoints += bucket.completedPoints || 0
      }
    }
  }
  return buckets
})
</script>

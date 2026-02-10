<template>
  <div class="w-full">
    <div v-if="totalPoints === 0" data-testid="no-data" class="h-6 bg-gray-100 rounded text-center text-xs text-gray-400 leading-6">
      No points
    </div>
    <div v-else class="relative h-6 rounded overflow-hidden flex">
      <div
        v-if="bugsPercent > 0"
        data-testid="segment-bugs-tech-debt"
        class="bg-amber-400 h-full flex items-center justify-center text-xs font-medium text-amber-900"
        :style="{ width: bugsPercent + '%' }"
      >
        <span v-if="bugsPercent >= 10">{{ bugsPercent }}%</span>
      </div>
      <div
        v-if="featurePercent > 0"
        data-testid="segment-feature-work"
        class="bg-blue-400 h-full flex items-center justify-center text-xs font-medium text-blue-900"
        :style="{ width: featurePercent + '%' }"
      >
        <span v-if="featurePercent >= 10">{{ featurePercent }}%</span>
      </div>
      <div
        v-if="learningPercent > 0"
        data-testid="segment-learning"
        class="bg-green-400 h-full flex items-center justify-center text-xs font-medium text-green-900"
        :style="{ width: learningPercent + '%' }"
      >
        <span v-if="learningPercent >= 10">{{ learningPercent }}%</span>
      </div>

      <!-- Target marker lines at 40% and 80% -->
      <div
        data-testid="target-marker"
        class="absolute top-0 bottom-0 w-px border-l border-dashed border-gray-600 opacity-50"
        style="left: 40%"
      ></div>
      <div
        data-testid="target-marker"
        class="absolute top-0 bottom-0 w-px border-l border-dashed border-gray-600 opacity-50"
        style="left: 80%"
      ></div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  buckets: {
    type: Object,
    required: true
  },
  totalPoints: {
    type: Number,
    required: true
  }
})

const bugsPercent = computed(() => {
  if (props.totalPoints === 0) return 0
  return Math.round((props.buckets['bugs-tech-debt']?.points || 0) / props.totalPoints * 100)
})

const featurePercent = computed(() => {
  if (props.totalPoints === 0) return 0
  return Math.round((props.buckets['feature-work']?.points || 0) / props.totalPoints * 100)
})

const learningPercent = computed(() => {
  if (props.totalPoints === 0) return 0
  return Math.round((props.buckets['learning']?.points || 0) / props.totalPoints * 100)
})
</script>

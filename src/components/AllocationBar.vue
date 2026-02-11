<template>
  <div class="w-full">
    <div v-if="totalPoints === 0" data-testid="no-data" class="h-6 bg-gray-100 rounded text-center text-xs text-gray-400 leading-6">
      No points
    </div>
    <div v-else class="relative h-6 rounded overflow-hidden flex">
      <div
        v-if="techDebtPercent > 0"
        data-testid="segment-tech-debt-quality"
        class="bg-amber-400 h-full flex items-center justify-center text-xs font-medium text-amber-900 cursor-default"
        :style="{ width: techDebtPercent + '%' }"
        :title="`Tech Debt & Quality: ${buckets['tech-debt-quality']?.points || 0} pts (${techDebtPercent}%)`"
      >
        <span v-if="techDebtPercent >= 10">{{ techDebtPercent }}%</span>
      </div>
      <div
        v-if="featurePercent > 0"
        data-testid="segment-new-features"
        class="bg-blue-400 h-full flex items-center justify-center text-xs font-medium text-blue-900 cursor-default"
        :style="{ width: featurePercent + '%' }"
        :title="`New Features: ${buckets['new-features']?.points || 0} pts (${featurePercent}%)`"
      >
        <span v-if="featurePercent >= 10">{{ featurePercent }}%</span>
      </div>
      <div
        v-if="learningPercent > 0"
        data-testid="segment-learning-enablement"
        class="bg-green-400 h-full flex items-center justify-center text-xs font-medium text-green-900 cursor-default"
        :style="{ width: learningPercent + '%' }"
        :title="`Learning & Enablement: ${buckets['learning-enablement']?.points || 0} pts (${learningPercent}%)`"
      >
        <span v-if="learningPercent >= 10">{{ learningPercent }}%</span>
      </div>
      <div
        v-if="uncategorizedPercent > 0"
        data-testid="segment-uncategorized"
        class="bg-gray-400 h-full flex items-center justify-center text-xs font-medium text-gray-900 cursor-default"
        :style="{ width: uncategorizedPercent + '%' }"
        :title="`Uncategorized: ${buckets['uncategorized']?.points || 0} pts (${uncategorizedPercent}%)`"
      >
        <span v-if="uncategorizedPercent >= 10">{{ uncategorizedPercent }}%</span>
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

const techDebtPercent = computed(() => {
  if (props.totalPoints === 0) return 0
  return Math.round((props.buckets['tech-debt-quality']?.points || 0) / props.totalPoints * 100)
})

const featurePercent = computed(() => {
  if (props.totalPoints === 0) return 0
  return Math.round((props.buckets['new-features']?.points || 0) / props.totalPoints * 100)
})

const learningPercent = computed(() => {
  if (props.totalPoints === 0) return 0
  return Math.round((props.buckets['learning-enablement']?.points || 0) / props.totalPoints * 100)
})

const uncategorizedPercent = computed(() => {
  if (props.totalPoints === 0) return 0
  return Math.round((props.buckets['uncategorized']?.points || 0) / props.totalPoints * 100)
})
</script>

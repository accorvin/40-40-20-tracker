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

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <div
        v-for="board in boards"
        :key="board.id"
        class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md hover:border-primary-300 transition-all cursor-pointer"
        @click="$emit('select-team', board)"
      >
        <h3 class="font-semibold text-gray-900 truncate">{{ board.displayName || board.name }}</h3>
        <p class="text-sm text-gray-500 mt-1">No sprint data yet</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  boards: {
    type: Array,
    default: () => []
  }
})

defineEmits(['select-team'])
</script>

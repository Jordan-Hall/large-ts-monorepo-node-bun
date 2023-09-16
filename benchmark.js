const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const parser = require('yargs-parser');

const options = parser(process.argv.slice(2), {
  // small, medium, large, nested
  string: ['scenario'],
  boolean: ['verbose'],
});

if (!options.scenario) {
  throw new Error('Please specify the package size to run the benchmark for.');
}

const scenarioInfo = {
  small: {
    levels: [1, 3, 2],
    count: 10,
  },
  medium: {
    levels: [1, 7, 6],
    count: 50,
  },
  large: {
    levels: [1, 12, 20],
    count: 253,
  },
  nested: {
    levels: [1, 2, 2, 2, 2, 2],
    count: 63,
  },
};

const NUMBER_OF_RUNS = 3;
const totalPkgs = scenarioInfo[options.scenario].count;

function logTitle(message) {
  console.log(''.padEnd(message.length, '-'));
  console.log(message);
  console.log(''.padEnd(message.length, '-'));
}

function clearOutput() {
  cp.execSync('rm -rf dist');
}
function clearCache() {
  cp.execSync('nx reset');
}

function spawnSync(cmd, args, env = {}) {
  return cp.spawnSync(
    path.join(
      '.',
      'node_modules',
      '.bin',
      os.platform() === 'win32' ? cmd + '.cmd' : cmd
    ),
    args,
    {
      stdio: options.verbose ? 'inherit' : 'pipe',
      env: { ...process.env, ...env },
    }
  );
}

function runBenchmark(task, options = {}) {
  clearOutput();
  clearCache();

  if (options.warmup) {
    console.log('Running warmup...');
    task();
  }

  let totalTime = 0;
  for (let i = 0; i < NUMBER_OF_RUNS; ++i) {
    (options.clearOutput ?? true) && clearOutput();
    (options.clearCache ?? true) && clearCache();
    options.prepare && options.prepare();

    console.log(`Run ${i + 1}...`);
    const startTime = Date.now();
    task();
    const endTime = Date.now();
    const elapsedTime = endTime - startTime;
    totalTime += elapsedTime;
    console.log(`Ran in ${elapsedTime}ms`);
  }

  return totalTime / NUMBER_OF_RUNS;
}

function getPkgsToAffectCount(percentage) {
  const count = Math.round((totalPkgs * percentage) / 100);
  const actualPercentage = Math.round((count * 100) / totalPkgs);

  return { count, percentage: actualPercentage };
}

function updatePkg(pkgName) {
  const filePath = path.join(__dirname, 'packages', pkgName, 'src', 'index.ts');
  const content = fs.readFileSync(filePath);
  fs.writeFileSync(filePath, `${content}//`);
}

function affectPackages(pkgsCountToAffect) {
  let affectedPkgsCount = 0;

  // level 0
  updatePkg(`${options.scenario}-pkg1`);
  affectedPkgsCount++;

  // level 1
  for (
    let i = 1;
    i <= scenarioInfo[options.scenario].levels[1] &&
    affectedPkgsCount < pkgsCountToAffect;
    i++
  ) {
    updatePkg(`${options.scenario}-pkg1-${i}`);
    affectedPkgsCount++;
  }

  // level 2
  for (
    let i = 1;
    i <= scenarioInfo[options.scenario].levels[1] &&
    affectedPkgsCount < pkgsCountToAffect;
    i++
  ) {
    for (
      let j = 1;
      j <= scenarioInfo[options.scenario].levels[2] &&
      affectedPkgsCount < pkgsCountToAffect;
      j++
    ) {
      updatePkg(`${options.scenario}-pkg1-${i}-${j}`);
      affectedPkgsCount++;
    }
  }
}

const affected10Info = getPkgsToAffectCount(10);
const affected20Info = getPkgsToAffectCount(20);
const affected50Info = getPkgsToAffectCount(50);
const benchmarkTimes = {
  node: {
    normal: {
      cold: 0,
      affected10: 0,
      affected20: 0,
      affected50: 0,
      affectedLeafDep: 0,
    },
    batch: {
      cold: 0,
      affected10: 0,
      affected20: 0,
      affected50: 0,
      affectedLeafDep: 0,
    },
  },
  bun: {
    normal: {
      cold: 0,
      affected10: 0,
      affected20: 0,
      affected50: 0,
      affectedLeafDep: 0,
    },
    batch: {
      cold: 0,
      affected10: 0,
      affected20: 0,
      affected50: 0,
      affectedLeafDep: 0,
    },
  }
};

// Cold builds
logTitle(`Running in Node a cold build with @nx/js:tsc ${NUMBER_OF_RUNS} times`);
benchmarkTimes.node.normal.cold = runBenchmark(() =>
  spawnSync('nx', ['run', `${options.scenario}-pkg1:build`])
);
// Cold builds
logTitle(`Running in Bun a cold build with @nx/js:tsc ${NUMBER_OF_RUNS} times`);
benchmarkTimes.bun.normal.cold = runBenchmark(() =>
  spawnSync('bunx', [ '--bun', 'nx', 'run', `${options.scenario}-pkg1:build`])
);

logTitle(
  `Running in node a cold build with @nx/js:tsc using batch execution ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.node.batch.cold = runBenchmark(() =>
  spawnSync('nx', ['run', `${options.scenario}-pkg1:build`], {
    NX_BATCH_MODE: 'true',
  })
);

logTitle(
  `Running in bun a cold build with @nx/js:tsc using batch execution ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.bun.batch.cold = runBenchmark(() =>
  spawnSync('bunx', [ '--bun', 'nx', 'run', `${options.scenario}-pkg1:build`], {
    NX_BATCH_MODE: 'true',
  })
);





// ~10% affected
const affected10RunOptions = {
  prepare: () => affectPackages(affected10Info.count),
  warmup: true,
  clearCache: false,
  clearOutput: false,
};

logTitle(
  `Running in node build for ${affected10Info.count} affected packages (~${affected10Info.percentage}%) with @nx/js:tsc ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.node.normal.affected10 = runBenchmark(
  () => spawnSync('nx', ['run', `${options.scenario}-pkg1:build`]),
  affected10RunOptions
);
logTitle(
  `Running in bun build for ${affected10Info.count} affected packages (~${affected10Info.percentage}%) with @nx/js:tsc ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.bun.normal.affected10 = runBenchmark(
  () => spawnSync('bunx', [ '--bun', 'nx', 'run', `${options.scenario}-pkg1:build`]),
  affected10RunOptions
);




logTitle(
  `Running in node build for ${affected10Info.count} affected packages (~${affected10Info.percentage}%) with @nx/js:tsc using batch execution ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.node.batch.affected10 = runBenchmark(
  () =>
    spawnSync('nx', ['run', `${options.scenario}-pkg1:build`], {
      NX_BATCH_MODE: 'true',
    }),
  affected10RunOptions
);
logTitle(
  `Running in bun build for ${affected10Info.count} affected packages (~${affected10Info.percentage}%) with @nx/js:tsc using batch execution ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.bun.batch.affected10 = runBenchmark(
  () =>
    spawnSync('bunx', [ '--bun', 'nx', 'run', `${options.scenario}-pkg1:build`], {
      NX_BATCH_MODE: 'true',
    }),
  affected10RunOptions
);



// ~20% affected
const affected20RunOptions = {
  prepare: () => affectPackages(affected20Info.count),
  warmup: true,
  clearCache: false,
  clearOutput: false,
};

logTitle(
  `Running in node build for ${affected20Info.count} affected packages (~${affected20Info.percentage}%) with @nx/js:tsc ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.node.normal.affected20 = runBenchmark(
  () => spawnSync('nx', ['run', `${options.scenario}-pkg1:build`]),
  affected20RunOptions
);
logTitle(
  `Running in bun build for ${affected20Info.count} affected packages (~${affected20Info.percentage}%) with @nx/js:tsc ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.bun.normal.affected20 = runBenchmark(
  () => spawnSync('bunx', [ '--bun', 'nx', 'run', `${options.scenario}-pkg1:build`]),
  affected20RunOptions
);


logTitle(
  `Running in node build for ${affected20Info.count} affected packages (~${affected20Info.percentage}%) with @nx/js:tsc using batch execution ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.node.batch.affected20 = runBenchmark(
  () =>
    spawnSync('nx', ['run', `${options.scenario}-pkg1:build`], {
      NX_BATCH_MODE: 'true',
    }),
  affected20RunOptions
);

logTitle(
  `Running in bun build for ${affected20Info.count} affected packages (~${affected20Info.percentage}%) with @nx/js:tsc using batch execution ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.bun.batch.affected20 = runBenchmark(
  () =>
    spawnSync('bunx', [ '--bun', 'nx', 'run', `${options.scenario}-pkg1:build`], {
      NX_BATCH_MODE: 'true',
    }),
  affected20RunOptions
);



// ~50% affected
const affected50RunOptions = {
  prepare: () => affectPackages(affected50Info.count),
  warmup: true,
  clearCache: false,
  clearOutput: false,
};

logTitle(
  `Running in node build for ${affected50Info.count} affected packages (~${affected50Info.percentage}%) with @nx/js:tsc ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.node.normal.affected50 = runBenchmark(
  () => spawnSync('nx', ['run', `${options.scenario}-pkg1:build`]),
  affected50RunOptions
);
logTitle(
  `Running in bun build for ${affected50Info.count} affected packages (~${affected50Info.percentage}%) with @nx/js:tsc ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.bun.normal.affected50 = runBenchmark(
  () => spawnSync('bunx', [ '--bun', 'nx', 'run', `${options.scenario}-pkg1:build`]),
  affected50RunOptions
);

logTitle(
  `Running in node build for ${affected50Info.count} affected packages (~${affected50Info.percentage}%) with @nx/js:tsc using batch execution ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.node.batch.affected50 = runBenchmark(
  () =>
    spawnSync('nx', ['run', `${options.scenario}-pkg1:build`], {
      NX_BATCH_MODE: 'true',
    }),
  affected50RunOptions
);

logTitle(
  `Running in bun build for ${affected50Info.count} affected packages (~${affected50Info.percentage}%) with @nx/js:tsc using batch execution ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.bun.batch.affected50 = runBenchmark(
  () =>
    spawnSync('bunx', [ '--bun', 'nx', 'run', `${options.scenario}-pkg1:build`], {
      NX_BATCH_MODE: 'true',
    }),
  affected50RunOptions
);

// leaf project dep affected
const affectedLeafDepRunOptions = {
  prepare: () => {
    const topPkgName = `${options.scenario}-pkg1`;
    updatePkg(
      topPkgName.padEnd(
        topPkgName.length +
          2 * (scenarioInfo[options.scenario].levels.length - 1),
        '-1'
      )
    );
  },
  warmup: true,
  clearCache: false,
  clearOutput: false,
};

logTitle(
  `Running in node build for project with a leaf dependency affected with @nx/js:tsc ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.node.normal.affectedLeafDep = runBenchmark(
  () => spawnSync('nx', ['run', `${options.scenario}-pkg1:build`]),
  affectedLeafDepRunOptions
);
logTitle(
  `Running in bun build for project with a leaf dependency affected with @nx/js:tsc ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.bun.normal.affectedLeafDep = runBenchmark(
  () => spawnSync('bunx', [ '--bun', 'nx', 'run', `${options.scenario}-pkg1:build`]),
  affectedLeafDepRunOptions
);

logTitle(
  `Running in node build for project with a leaf dependency affected with @nx/js:tsc using batch execution ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.node.batch.affectedLeafDep = runBenchmark(
  () =>
    spawnSync('nx', ['run', `${options.scenario}-pkg1:build`], {
      NX_BATCH_MODE: 'true',
    }),
  affectedLeafDepRunOptions
);

logTitle(
  `Running in bun build for project with a leaf dependency affected with @nx/js:tsc using batch execution ${NUMBER_OF_RUNS} times`
);
benchmarkTimes.bun.batch.affectedLeafDep = runBenchmark(
  () =>
    spawnSync('bunx', [ '--bun', 'nx', 'run', `${options.scenario}-pkg1:build`], {
      NX_BATCH_MODE: 'true',
    }),
  affectedLeafDepRunOptions
);


function logTitle(title) {
  console.log(`===== ${title} =====`);
}

function dynamicComparison(time1, description1, time2, description2) {
  if (time1 === time2) {
      return `${description1} is equally fast as ${description2}.`;
  }
  
  const fasterDescription = time1 < time2 ? description1 : description2;
  const slowerDescription = time1 > time2 ? description1 : description2;
  const speedFactor = time1 < time2 ? time2 / time1 : time1 / time2;

  return `${fasterDescription} is ${speedFactor.toFixed(2)}x faster than ${slowerDescription}.`;
}

function calculateWinnerAndPercent(val1, val2) {
  if (val1 < val2) {
    return { winner: "node", percent: ((val2 - val1) / val1) * 100 };
  } else {
    return { winner: "bun", percent: ((val1 - val2) / val2) * 100 };
  }
}


console.log('\n\n');
logTitle('RESULTS');
console.log('\n');

console.log(`Average cold build time in node with @nx/js:tsc is: ${benchmarkTimes.node.normal.cold}ms`);
console.log(`Average cold build time in node with @nx/js:tsc using batch execution time is: ${benchmarkTimes.node.batch.cold}ms`);
console.log(`Average cold build time in bun with @nx/js:tsc is: ${benchmarkTimes.bun.normal.cold}ms`);
console.log(`Average cold build time in bun with @nx/js:tsc using batch execution time is: ${benchmarkTimes.bun.batch.cold}ms`);

console.log(dynamicComparison(
  benchmarkTimes.node.normal.cold, 
  'Cold builds in node with @nx/js:tsc using non-batch execution',
  benchmarkTimes.node.batch.cold, 
  'Cold builds in node with @nx/js:tsc using batch execution'
));

console.log(dynamicComparison(
  benchmarkTimes.bun.normal.cold, 
  'Cold builds in bun with @nx/js:tsc using non-batch execution',
  benchmarkTimes.bun.batch.cold, 
  'Cold builds in bun with @nx/js:tsc using batch execution'
));

console.log(dynamicComparison(
  benchmarkTimes.node.normal.cold, 
  'Cold builds in node with @nx/js:tsc using non-batch execution',
  benchmarkTimes.bun.normal.cold, 
  'Cold builds in bun with @nx/js:tsc using non-batch execution'
));

console.log(dynamicComparison(
  benchmarkTimes.node.batch.cold, 
  'Cold builds in node with @nx/js:tsc using batch execution',
  benchmarkTimes.bun.batch.cold, 
  'Cold builds in bun with @nx/js:tsc using batch execution'
));
console.table([
  {
    Type: "Normal",
    Node: benchmarkTimes.node.normal.cold,
    Bun: benchmarkTimes.bun.normal.cold,
    ...calculateWinnerAndPercent(benchmarkTimes.node.normal.affected10, benchmarkTimes.bun.normal.cold)
  },
  {
    Type: "Batch",
    Node: benchmarkTimes.node.batch.cold,
    Bun: benchmarkTimes.bun.batch.cold,
    ...calculateWinnerAndPercent(benchmarkTimes.node.batch.cold, benchmarkTimes.bun.batch.cold)
  }
], ["Type", "Node", "Bun", "winner", "percent"]);

console.log('\n');

console.log(`Average build time in node for ${affected10Info.count} affected packages (~${affected10Info.percentage}%) with @nx/js:tsc is: ${benchmarkTimes.node.normal.affected10}ms`);
console.log(`Average build time in node for ${affected10Info.count} affected packages (~${affected10Info.percentage}%) with @nx/js:tsc using batch execution time is: ${benchmarkTimes.node.batch.affected10}ms`);
console.log(`Average build time in bun for ${affected10Info.count} affected packages (~${affected10Info.percentage}%) with @nx/js:tsc is: ${benchmarkTimes.bun.normal.affected10}ms`);
console.log(`Average build time in bun for ${affected10Info.count} affected packages (~${affected10Info.percentage}%) with @nx/js:tsc using batch execution time is: ${benchmarkTimes.bun.batch.affected10}ms`);

console.log(dynamicComparison(
    benchmarkTimes.node.normal.affected10, 
    `Running @nx/js:tsc in node using non-batch execution for ${affected10Info.count} affected packages`,
    benchmarkTimes.node.batch.affected10, 
    `Running @nx/js:tsc in node using batch execution for ${affected10Info.count} affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.bun.normal.affected10, 
    `Running @nx/js:tsc in bun using non-batch execution for ${affected10Info.count} affected packages`,
    benchmarkTimes.bun.batch.affected10, 
    `Running @nx/js:tsc in bun using batch execution for ${affected10Info.count} affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.node.normal.affected10, 
    `Running @nx/js:tsc in node using non-batch execution for ${affected10Info.count} affected packages`,
    benchmarkTimes.bun.normal.affected10, 
    `Running @nx/js:tsc in bun using non-batch execution for ${affected10Info.count} affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.node.batch.affected10, 
    `Running @nx/js:tsc in node using batch execution for ${affected10Info.count} affected packages`,
    benchmarkTimes.bun.batch.affected10, 
    `Running @nx/js:tsc in bun using batch execution for ${affected10Info.count} affected packages`
));
console.table([
  {
    Type: "Normal",
    Node: benchmarkTimes.node.normal.affected10,
    Bun: benchmarkTimes.bun.normal.affected20,
    ...calculateWinnerAndPercent(benchmarkTimes.node.normal.affected10, benchmarkTimes.bun.normal.affected10)
  },
  {
    Type: "Batch",
    Node: benchmarkTimes.node.batch.affected10,
    Bun: benchmarkTimes.bun.batch.affected10,
    ...calculateWinnerAndPercent(benchmarkTimes.node.batch.affected10, benchmarkTimes.bun.batch.affected10)
  }
], ["Type", "Node", "Bun", "winner", "percent"]);


console.log('\n');

console.log(`Average build time in node for ${affected20Info.count} affected packages (~${affected20Info.percentage}%) with @nx/js:tsc is: ${benchmarkTimes.node.normal.affected20}ms`);
console.log(`Average build time in node for ${affected20Info.count} affected packages (~${affected20Info.percentage}%) with @nx/js:tsc using batch execution time is: ${benchmarkTimes.node.batch.affected20}ms`);
console.log(`Average build time in bun for ${affected20Info.count} affected packages (~${affected20Info.percentage}%) with @nx/js:tsc is: ${benchmarkTimes.bun.normal.affected20}ms`);
console.log(`Average build time in bun for ${affected20Info.count} affected packages (~${affected20Info.percentage}%) with @nx/js:tsc using batch execution time is: ${benchmarkTimes.bun.batch.affected20}ms`);

console.log(dynamicComparison(
    benchmarkTimes.node.normal.affected20, 
    `Running @nx/js:tsc in node using non-batch execution for ${affected20Info.count} affected packages`,
    benchmarkTimes.node.batch.affected20, 
    `Running @nx/js:tsc in node using batch execution for ${affected20Info.count} affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.bun.normal.affected20, 
    `Running @nx/js:tsc in bun using non-batch execution for ${affected20Info.count} affected packages`,
    benchmarkTimes.bun.batch.affected20, 
    `Running @nx/js:tsc in bun using batch execution for ${affected20Info.count} affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.node.normal.affected20, 
    `Running @nx/js:tsc in node using non-batch execution for ${affected20Info.count} affected packages`,
    benchmarkTimes.bun.normal.affected20, 
    `Running @nx/js:tsc in bun using non-batch execution for ${affected20Info.count} affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.node.batch.affected20, 
    `Running @nx/js:tsc in node using batch execution for ${affected20Info.count} affected packages`,
    benchmarkTimes.bun.batch.affected20, 
    `Running @nx/js:tsc in bun using batch execution for ${affected20Info.count} affected packages`
));
console.table([
  {
    Type: "Normal",
    Node: benchmarkTimes.node.normal.affected20,
    Bun: benchmarkTimes.bun.normal.affected20,
    ...calculateWinnerAndPercent(benchmarkTimes.node.normal.affected20, benchmarkTimes.bun.normal.affected20)
  },
  {
    Type: "Batch",
    Node: benchmarkTimes.node.batch.affected20,
    Bun: benchmarkTimes.bun.batch.affected20,
    ...calculateWinnerAndPercent(benchmarkTimes.node.batch.affected20, benchmarkTimes.bun.batch.affected20)
  }
], ["Type", "Node", "Bun", "winner", "percent"]);

console.log('\n');


console.log(`Average build time in node for ${affected50Info.count} affected packages (~${affected50Info.percentage}%) with @nx/js:tsc is: ${benchmarkTimes.node.normal.affected50}ms`);
console.log(`Average build time in node for ${affected50Info.count} affected packages (~${affected50Info.percentage}%) with @nx/js:tsc using batch execution time is: ${benchmarkTimes.node.batch.affected50}ms`);
console.log(`Average build time in bun for ${affected50Info.count} affected packages (~${affected50Info.percentage}%) with @nx/js:tsc is: ${benchmarkTimes.bun.normal.affected50}ms`);
console.log(`Average build time in bun for ${affected50Info.count} affected packages (~${affected50Info.percentage}%) with @nx/js:tsc using batch execution time is: ${benchmarkTimes.bun.batch.affected50}ms`);

console.log(dynamicComparison(
    benchmarkTimes.node.normal.affected50, 
    `Running @nx/js:tsc in node using non-batch execution for ${affected50Info.count} affected packages`,
    benchmarkTimes.node.batch.affected50, 
    `Running @nx/js:tsc in node using batch execution for ${affected50Info.count} affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.bun.normal.affected50, 
    `Running @nx/js:tsc in bun using non-batch execution for ${affected50Info.count} affected packages`,
    benchmarkTimes.bun.batch.affected50, 
    `Running @nx/js:tsc in bun using batch execution for ${affected50Info.count} affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.node.normal.affected50, 
    `Running @nx/js:tsc in node using non-batch execution for ${affected50Info.count} affected packages`,
    benchmarkTimes.bun.normal.affected50, 
    `Running @nx/js:tsc in bun using non-batch execution for ${affected50Info.count} affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.node.batch.affected50, 
    `Running @nx/js:tsc in node using batch execution for ${affected50Info.count} affected packages`,
    benchmarkTimes.bun.batch.affected50, 
    `Running @nx/js:tsc in bun using batch execution for ${affected50Info.count} affected packages`
));

console.table([
  {
    Type: "Normal",
    Node: benchmarkTimes.node.normal.affected50,
    Bun: benchmarkTimes.bun.normal.affected50,
    ...calculateWinnerAndPercent(benchmarkTimes.node.normal.affected50, benchmarkTimes.bun.normal.affected50)
  },
  {
    Type: "Batch",
    Node: benchmarkTimes.node.batch.affected50,
    Bun: benchmarkTimes.bun.batch.affected50,
    ...calculateWinnerAndPercent(benchmarkTimes.node.batch.affected50, benchmarkTimes.bun.batch.affected50)
  }
], ["Type", "Node", "Bun", "winner", "percent"]);


console.log('\n');

console.log(`Average build time in node for leaf dependency affected packages (~${affectedLeafDepInfo.percentage}%) with @nx/js:tsc is: ${benchmarkTimes.node.normal.affectedLeafDep}ms`);
console.log(`Average build time in node for leaf dependency affected packages (~${affectedLeafDepInfo.percentage}%) with @nx/js:tsc using batch execution time is: ${benchmarkTimes.node.batch.affectedLeafDep}ms`);
console.log(`Average build time in bun for leaf dependency affected packages (~${affectedLeafDepInfo.percentage}%) with @nx/js:tsc is: ${benchmarkTimes.bun.normal.affectedLeafDep}ms`);
console.log(`Average build time in bun for leaf dependency affected packages (~${affectedLeafDepInfo.percentage}%) with @nx/js:tsc using batch execution time is: ${benchmarkTimes.bun.batch.affectedLeafDep}ms`);

console.log(dynamicComparison(
    benchmarkTimes.node.normal.affectedLeafDep, 
    `Running @nx/js:tsc in node using non-batch execution for leaf dependency affected packages`,
    benchmarkTimes.node.batch.affectedLeafDep, 
    `Running @nx/js:tsc in node using batch execution for leaf dependency affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.bun.normal.affectedLeafDep, 
    `Running @nx/js:tsc in bun using non-batch execution for leaf dependency affected packages`,
    benchmarkTimes.bun.batch.affectedLeafDep, 
    `Running @nx/js:tsc in bun using batch execution for leaf dependency affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.node.normal.affectedLeafDep, 
    `Running @nx/js:tsc in node using non-batch execution for leaf dependency affected packages`,
    benchmarkTimes.bun.normal.affectedLeafDep, 
    `Running @nx/js:tsc in bun using non-batch execution for leaf dependency affected packages`
));

console.log(dynamicComparison(
    benchmarkTimes.node.batch.affectedLeafDep, 
    `Running @nx/js:tsc in node using batch execution for leaf dependency affected packages`,
    benchmarkTimes.bun.batch.affectedLeafDep, 
    `Running @nx/js:tsc in bun using batch execution for leaf dependency affected packages`
));


console.table([
  {
    Type: "Normal",
    Node: benchmarkTimes.node.normal.affectedLeafDep,
    Bun: benchmarkTimes.bun.normal.affectedLeafDep,
    ...calculateWinnerAndPercent(benchmarkTimes.node.normal.affectedLeafDep, benchmarkTimes.bun.normal.affectedLeafDep)
  },
  {
    Type: "Batch",
    Node: benchmarkTimes.node.batch.affectedLeafDep,
    Bun: benchmarkTimes.bun.batch.affectedLeafDep,
    ...calculateWinnerAndPercent(benchmarkTimes.node.batch.affectedLeafDep, benchmarkTimes.bun.batch.affectedLeafDep)
  }
], ["Type", "Node", "Bun", "winner", "percent"]);

const bigComparisonTable = [
  {
    Category: "Cold",
    "Node None-Batch": benchmarkTimes.node.normal.cold,
    "Node Batch": benchmarkTimes.node.batch.cold,
    "Bun None-Batch": benchmarkTimes.bun.normal.cold,
    "Bun Batch": benchmarkTimes.bun.batch.cold,
    ...calculateWinnerAndPercentForAll(
      benchmarkTimes.node.normal.cold,
      benchmarkTimes.node.batch.cold,
      benchmarkTimes.bun.normal.cold,
      benchmarkTimes.bun.batch.cold
    )
  },
  {
    Category: `${affected10Info.count} Affected (~${affected10Info.percentage}%)`,
    "Node None-Batch": benchmarkTimes.node.normal.affected10,
    "Node Batch": benchmarkTimes.node.batch.affected10,
    "Bun None-Batch": benchmarkTimes.bun.normal.affected10,
    "Bun Batch": benchmarkTimes.bun.batch.affected10,
    ...calculateWinnerAndPercentForAll(
      benchmarkTimes.node.normal.affected10,
      benchmarkTimes.node.batch.affected10,
      benchmarkTimes.bun.normal.affected10,
      benchmarkTimes.bun.batch.affected10
    )
  },
  {
    Category: `${affected20Info.count} Affected (~${affected20Info.percentage}%)`,
    "Node None-Batch": benchmarkTimes.node.normal.affected20,
    "Node Batch": benchmarkTimes.node.batch.affected20,
    "Bun None-Batch": benchmarkTimes.bun.normal.affected20,
    "Bun Batch": benchmarkTimes.bun.batch.affected20,
    ...calculateWinnerAndPercentForAll(
      benchmarkTimes.node.normal.affected20,
      benchmarkTimes.node.batch.affected20,
      benchmarkTimes.bun.normal.affected20,
      benchmarkTimes.bun.batch.affected20
    )
  }
  // ... add more categories as needed
];

function calculateWinnerAndPercentForAll(nodeNonBatch, nodeBatch, bunNonBatch, bunBatch) {
  let winnerNonBatch = nodeNonBatch < bunNonBatch ? "Node" : "Bun";
  let winnerBatch = nodeBatch < bunBatch ? "Node" : "Bun";
  let percentDifferenceNonBatch = ((bunNonBatch - nodeNonBatch) / nodeNonBatch) * 100;
  let percentDifferenceBatch = ((bunBatch - nodeBatch) / nodeBatch) * 100;

  return {
    "Winner None-Batch": winnerNonBatch,
    "Winner Batch": winnerBatch,
    "Difference (%) None-Batch": `${percentDifferenceNonBatch.toFixed(2)}%`,
    "Difference (%) Batch": `${percentDifferenceBatch.toFixed(2)}%`
  };
}

// Displaying the big comparison table:
console.table(bigComparisonTable);


// cleanup pkgs changes
cp.execSync('git restore .');

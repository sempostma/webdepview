
function onlyUnique (value, index, self) {
  return self.indexOf(value) === index
}

const mapValue = async (object, iteratee) => {
  object = Object(object)
  const result = {}

  for (const key in object) {
    if (object.hasOwnProperty(key)) {
      const [newKey, value] = await iteratee(object[key], key, object)
      if (typeof value !== 'undefined') result[newKey] = value
    }
  }
  return result
}

const accumulatePackages = async (dependencies, ignoreDev, getDependencySize) => {
  if (typeof dependencies === 'undefined') {
    return {
      count: 0,
      accumulated: [],
      required: []
    }
  }

  const accumulated = await mapValue(dependencies, async ({ version, dev, requires, dependencies: childDependencies, resolved }, key) => {
    if (ignoreDev && dev) return [key, undefined]
    const result = await accumulatePackages(childDependencies, ignoreDev, getDependencySize)
    const shared = result.required.length + Object.keys(requires || {}).length
    const required = Object.keys(requires || {}).concat(result.required).filter(onlyUnique)
    return [key, {
      ...result,
      shared: shared,
      required,
      childSize: getDependencySize && (result.childSize || 0) + await getDependencySize({ version, dev, requires, dependencies: childDependencies, resolved, name: key })
    }]
  })

  const length = Object.keys(dependencies).length
  const count = Object.values(accumulated).reduce((accumulator, current) => accumulator + (current.count || 0), length)
  const childSize = Object.values(accumulated).reduce((accumulator, current) => accumulator + (current.childSize || 0), length)
  const required = [].concat(...Object.values(accumulated).map(x => x.required)).filter(onlyUnique)

  return {
    count: count,
    accumulated,
    required,
    childSize
  }
}

module.exports = async ({ dependencies, ignoreDev = false, getDependencySize = null }) => {
  const result = await accumulatePackages(dependencies, ignoreDev, getDependencySize)
  const nice = Object.keys(result.accumulated).filter(name => !result.required.includes(name)).map(name => {
    const obj = result.accumulated[name]

    return {
      name,
      count: obj.count,
      shared: obj.shared,
      childSize: obj.childSize
    }
  })

  return nice
}

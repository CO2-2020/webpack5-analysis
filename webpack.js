"use strict";
//options配置项概要，按照字母顺序设置每个属性的描述和值类型，json文件
const webpackOptionsSchema = require("../schemas/WebpackOptions.json");
//编译器对象
const Compiler = require("./Compiler");
//多配置对象编译器对象，不会并行编译，还是继发编译
const MultiCompiler = require("./MultiCompiler");
//配置compiler实例工具
const WebpackOptionsApply = require("./WebpackOptionsApply");
//属性默认配置
const {
	applyWebpackOptionsDefaults,//默认配置
	applyWebpackOptionsBaseDefaults//基础默认配置
} = require("./config/defaults");
//获取webpck标准化配置
const { getNormalizedWebpackOptions } = require("./config/normalization");
//设置环境变量方法
const NodeEnvironmentPlugin = require("./node/NodeEnvironmentPlugin");
//验证模式
const validateSchema = require("./validateSchema");

//创建多配置编译对象
const createMultiCompiler = childOptions => {
	//给每个配置对象创建一个编译对象
	const compilers = childOptions.map(options => createCompiler(options));
	//由编译对象组成的数组生成多配置编译器对象实例
	const compiler = new MultiCompiler(compilers);
	//遍历编译对象数组
	for (const childCompiler of compilers) {
		//如果子编译对象有依赖属性
		if (childCompiler.options.dependencies) {
			//设置依赖
			compiler.setDependencies(
				childCompiler,
				childCompiler.options.dependencies
			);
		}
	}
	//返回的MultiCompiler对象
	return compiler;
};

const createCompiler = rawOptions => {
	//标准化webpack配置项
	const options = getNormalizedWebpackOptions(rawOptions);
	//根据options设置默认context
	applyWebpackOptionsBaseDefaults(options);
	//根据context创建Compiler
	const compiler = new Compiler(options.context);
	//将标准化后的options设置成compiler的options属性
	compiler.options = options;
	//环境变量方法设置compiler
	new NodeEnvironmentPlugin({
		infrastructureLogging: options.infrastructureLogging
	}).apply(compiler);
	//处理plugins
	if (Array.isArray(options.plugins)) {
		for (const plugin of options.plugins) {
			if (typeof plugin === "function") {
				plugin.call(compiler, compiler);
			} else {
				plugin.apply(compiler);
			}
		}
	}
  
	//*重点一* webpack 设置默认配置
	applyWebpackOptionsDefaults(options);
  
	//环境钩子执行
	compiler.hooks.environment.call();
	compiler.hooks.afterEnvironment.call();
  
	//*重点二* 根据options，调用内置插件，来配置compiler实例
	new WebpackOptionsApply().process(options, compiler);
  
	//初始化钩子
	compiler.hooks.initialize.call();
	return compiler;
};

const webpack = ((
	options,
	callback
) => {
  
	//根据webpackOptionsSchema概要，校验options是否合法，这个函数没有返回，主要是做错误提示
	validateSchema(webpackOptionsSchema, options);
	
	//定义compiler watch watch配置属性
	let compiler;
	let watch = false;
	let watchOptions;

	//创建compiler和watch以及watchoptions
	if (Array.isArray(options)) {
		//如果options是数组，创建多配置编译对象，以及watch和watch配置
		compiler = createMultiCompiler(options);
		watch = options.some(options => options.watch);
		watchOptions = options.map(options => options.watchOptions || {});
	} else {
		//大部分，options还是对象，单个配置编译对象
		compiler = createCompiler(options);
		watch = options.watch;
		watchOptions = options.watchOptions || {};
	}
	
	//必须有回调，没有回调编译不会执行，因为概要信息、错误都会传入回调
	if (callback) {
		//监听模式，则调用compiler.watch
		if (watch) {
			//返回一个 Watching 实例
			compiler.watch(watchOptions, callback);

		//非监听模式，则直接调用run
		} else {
			//run 方法用于触发所有编译时工作
			//这个 API 一次只支持一个并发编译
			compiler.run((err, stats) => {
				compiler.close(err2 => {
					//最终记录下来的概括信息(stats)和错误(errors)，应该在这个 callback 函数中获取。
					callback(err || err2, stats);
				});
			});
		}
	}
	return compiler;
});

module.exports = webpack;
